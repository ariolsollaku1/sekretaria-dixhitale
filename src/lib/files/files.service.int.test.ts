import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuditor } from "@/lib/audit";
import { db } from "@/lib/db";
import { LocalStorage } from "@/lib/storage/local";
import { MIME } from "./mime";
import { registerFilePurpose, resetFilePurposes } from "./purposes";
import {
  FileError,
  attachFile,
  cleanupOrphans,
  openFile,
  removeFile,
  storeUpload,
  verifyFile,
} from "./files.service";

const PDF = new TextEncoder().encode("%PDF-1.7 test document");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let dir: string;
let storage: LocalStorage;
const user = { id: "uploader" };
const allow = async () => true;

async function upload(over: Partial<Parameters<typeof storeUpload>[0]> = {}, can = allow) {
  return storeUpload(
    {
      user,
      purpose: "docs",
      fileName: "my file.pdf",
      declaredType: "application/pdf",
      bytes: PDF,
      ...over,
    },
    { storage, can },
  );
}

/** The audit/db context a module action would pass to attachFile / removeFile. */
const ctx = () =>
  ({
    db,
    audit: createAuditor(db, { type: "USER", userId: user.id }),
    user: { id: user.id },
  }) as never;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "files-"));
  storage = new LocalStorage(dir);
  resetFilePurposes();
  registerFilePurpose({
    id: "docs",
    uploadPermission: "plt.file.upload",
    maxBytes: 1024,
    mimeTypes: [MIME.pdf],
    // readable by anyone whose id starts with "reader" (stands in for a permission check)
    canRead: async (u, f) => u.id.startsWith("reader") && f.entityType === "Student",
  });
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "stored_files"');
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("storeUpload (AC-3, AC-4, AC-5, AC-6)", () => {
  it("stores bytes and metadata with hash, size, detected type, and audits it", async () => {
    const result = await upload();
    const row = await db.storedFile.findUniqueOrThrow({ where: { id: result.id } });
    expect(row).toMatchObject({
      purpose: "docs",
      fileName: "my file.pdf",
      mimeType: MIME.pdf,
      size: PDF.length,
      status: "PENDING",
      uploadedById: "uploader",
    });
    expect(row.storageKey).toMatch(/^\d{4}\/\d{2}\/[a-f0-9]{24}$/);
    expect(row.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await storage.read(row.storageKey)).toEqual(PDF);
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "plt.file.upload" } }),
    ).toMatchObject({ entityId: result.id, actorUserId: "uploader" });
  });

  it.each([
    ["unknown purpose", { purpose: "nope" }, "UNKNOWN_PURPOSE"],
    ["too large", { bytes: new Uint8Array(1025).fill(0x25) }, "TOO_LARGE"],
    ["empty", { bytes: new Uint8Array() }, "EMPTY"],
    [
      "type not allowed for the purpose",
      { bytes: PNG, declaredType: "image/png" },
      "UNSUPPORTED_TYPE",
    ],
    ["declared type contradicts content", { declaredType: "image/png" }, "TYPE_MISMATCH"],
    [
      "unknown content",
      { bytes: new TextEncoder().encode("<script>x</script>"), declaredType: "application/pdf" },
      "UNSUPPORTED_TYPE",
    ],
  ] as const)("rejects: %s", async (_name, over, code) => {
    await expect(upload(over)).rejects.toMatchObject({ code });
    expect(await db.storedFile.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("rejects users without the purpose's upload permission, storing nothing", async () => {
    await expect(upload({}, async () => false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.storedFile.count()).toBe(0);
  });

  it("never uses the supplied name as a path", async () => {
    const result = await upload({ fileName: "../../../etc/passwd.pdf" });
    const row = await db.storedFile.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.fileName).toBe("passwd.pdf");
    expect(row.storageKey).not.toContain("passwd");
  });

  it("removes the stored object again when the database part fails", async () => {
    await db.$executeRawUnsafe(
      'ALTER TABLE "stored_files" ADD CONSTRAINT tmp_fail CHECK (false) NOT VALID',
    );
    try {
      await expect(upload()).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "stored_files" DROP CONSTRAINT tmp_fail');
    }
    expect(await db.storedFile.count()).toBe(0);
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir, { recursive: true });
    expect(entries.filter((e) => /[a-f0-9]{24}$/.test(e))).toEqual([]);
  });
});

describe("attachFile / removeFile (AC-9, AC-10)", () => {
  it("attaches once; a second attach fails; unknown ids are NOT_FOUND", async () => {
    const { id } = await upload();
    await attachFile(ctx(), id, { entityType: "Student", entityId: "s1" });
    expect(await db.storedFile.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "ATTACHED",
      entityType: "Student",
      entityId: "s1",
    });
    await expect(
      attachFile(ctx(), id, { entityType: "Student", entityId: "s2" }),
    ).rejects.toMatchObject({ code: "ALREADY_ATTACHED" });
    await expect(
      attachFile(ctx(), "missing", { entityType: "Student", entityId: "s1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.auditLog.count({ where: { action: "plt.file.attach" } })).toBe(1);
  });

  it("has exactly one winner when two attaches race", async () => {
    const { id } = await upload();
    const results = await Promise.allSettled([
      attachFile(ctx(), id, { entityType: "Student", entityId: "a" }),
      attachFile(ctx(), id, { entityType: "Student", entityId: "b" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.any(FileError),
    });
  });

  it("soft-deletes, keeps the bytes, audits the reason, and blocks later attach", async () => {
    const { id } = await upload();
    await removeFile(ctx(), id, "wrong document");
    const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
    expect(await storage.exists(row.storageKey)).toBe(true);
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "plt.file.remove" } }),
    ).toMatchObject({ reason: "wrong document" });
    await expect(
      attachFile(ctx(), id, { entityType: "Student", entityId: "s1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeFile(ctx(), id, "again")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("openFile (AC-7)", () => {
  const read = async (u: { id: string }, id: string) => {
    const opened = await openFile(u, id, { storage });
    return opened ? new Uint8Array(await new Response(opened.stream).arrayBuffer()) : null;
  };

  it("lets the uploader read a pending file, nobody else", async () => {
    const { id } = await upload();
    expect(await read(user, id)).toEqual(PDF);
    expect(await read({ id: "reader-1" }, id)).toBeNull();
  });

  it("lets the purpose's canRead decide once attached", async () => {
    const { id } = await upload();
    await attachFile(ctx(), id, { entityType: "Student", entityId: "s1" });
    expect(await read({ id: "reader-1" }, id)).toEqual(PDF);
    expect(await read({ id: "stranger" }, id)).toBeNull();
    expect(await read(user, id)).toBeNull(); // the uploader loses the shortcut after attaching
  });

  it("answers null for unknown, soft-deleted, and purpose-less files", async () => {
    expect(await read(user, "missing")).toBeNull();
    const { id } = await upload();
    await removeFile(ctx(), id, "x");
    expect(await read(user, id)).toBeNull();

    const other = await upload();
    resetFilePurposes();
    await attachFile(ctx(), other.id, { entityType: "Student", entityId: "s1" });
    expect(await read({ id: "reader-1" }, other.id)).toBeNull();
  });

  it("returns null (not a crash) when the object is missing on the volume", async () => {
    const { id } = await upload();
    const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
    await storage.delete(row.storageKey);
    expect(await read(user, id)).toBeNull();
  });
});

describe("verifyFile (AC-13)", () => {
  it("is true for intact bytes and false after tampering or loss", async () => {
    const { id } = await upload();
    const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
    expect(await verifyFile(id, { storage })).toBe(true);
    await writeFile(join(dir, row.storageKey), "tampered");
    expect(await verifyFile(id, { storage })).toBe(false);
    await storage.delete(row.storageKey);
    expect(await verifyFile(id, { storage })).toBe(false);
    await expect(verifyFile("missing", { storage })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cleanupOrphans (AC-11)", () => {
  it("removes old pending files from db and volume, and nothing else", async () => {
    const old = await upload();
    const recent = await upload();
    const attached = await upload();
    const removed = await upload();
    await attachFile(ctx(), attached.id, { entityType: "Student", entityId: "s1" });
    await removeFile(ctx(), removed.id, "x");
    const hours = (n: number) => new Date(Date.now() - n * 3_600_000);
    await db.storedFile.updateMany({
      where: { id: { in: [old.id, attached.id, removed.id] } },
      data: { createdAt: hours(30) },
    });
    const oldRow = await db.storedFile.findUniqueOrThrow({ where: { id: old.id } });

    expect(await cleanupOrphans({}, { storage })).toBe(1);
    expect(await db.storedFile.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await storage.exists(oldRow.storageKey)).toBe(false);
    for (const keep of [recent.id, attached.id, removed.id]) {
      const row = await db.storedFile.findUniqueOrThrow({ where: { id: keep } });
      expect(await storage.exists(row.storageKey)).toBe(true);
    }
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "plt.file.cleanup" } }),
    ).toMatchObject({ actorType: "SYSTEM", after: { removed: 1 } });
    expect(await cleanupOrphans({}, { storage })).toBe(0); // nothing more, and no extra audit row
    expect(await db.auditLog.count({ where: { action: "plt.file.cleanup" } })).toBe(1);
  });

  it("honours a custom threshold", async () => {
    const f = await upload();
    expect(await cleanupOrphans({ olderThan: new Date(Date.now() - 60_000) }, { storage })).toBe(0);
    expect(await cleanupOrphans({ olderThan: new Date(Date.now() + 60_000) }, { storage })).toBe(1);
    expect(await db.storedFile.findUnique({ where: { id: f.id } })).toBeNull();
  });
});
