import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { openFile, storeUpload } from "@/lib/files/files.service";
import { resetFilePurposes } from "@/lib/files/purposes";
import { LocalStorage } from "@/lib/storage/local";
import "@/modules/ntf";
import { announcementSchema } from "../domain/schemas";
import * as svc from "./announcement.service";
import { listAttachments, registerNtfPurposes, removeAttachment } from "./attachments";

const PDF = new TextEncoder().encode("%PDF-1.7 announcement");
let dir: string;
let storage: LocalStorage;
let actorId = "admin";

function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: actorId,
      email: `${actorId}@t.test`,
      name: actorId,
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "ntf.announcement.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const upload = (userId = "admin") =>
  storeUpload(
    {
      user: { id: userId },
      purpose: "announcement-attachment",
      fileName: "orari.pdf",
      declaredType: "application/pdf",
      bytes: PDF,
    },
    { storage, can: async () => true },
  );
const input = announcementSchema.parse({
  title: "Orari",
  body: "Shih bashkëngjitjen.",
  audience: "STAFF",
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ntf-files-"));
  storage = new LocalStorage(dir);
  resetFilePurposes();
  registerNtfPurposes();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "stored_files", "announcements", "user_roles" CASCADE',
  );
  await db.user.deleteMany();
  for (const [id, role] of [
    ["admin", "sysadmin"],
    ["lec", "lecturer"],
    ["stu", "student"],
  ] as const) {
    await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
    await db.userRole.create({
      data: { userId: id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
    });
  }
  actorId = "admin";
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("attachments (AC-9)", () => {
  it("attaches uploaded files; whoever sees the notice downloads them, others do not", async () => {
    const file = await upload();
    const created = await run((ctx) => svc.createAnnouncement(ctx, input, [file.id]));
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const id = created.data.announcementId;
    expect(await listAttachments(id)).toMatchObject([{ id: file.id, fileName: "orari.pdf" }]);

    // draft: only the authors' reach can read it
    expect(await openFile({ id: "lec" }, file.id, { storage })).toBeNull();
    expect(await openFile({ id: "admin" }, file.id, { storage })).not.toBeNull();

    await run((ctx) => svc.publishAnnouncement(ctx, id));
    expect(await openFile({ id: "lec" }, file.id, { storage })).not.toBeNull();
    // STAFF audience: a student gets nothing
    expect(await openFile({ id: "stu" }, file.id, { storage })).toBeNull();
  });

  it("allows at most 5 files and only the uploader's own files of this purpose", async () => {
    const six = await Promise.all(Array.from({ length: 6 }, () => upload()));
    const tooMany = await run((ctx) =>
      svc.createAnnouncement(
        ctx,
        input,
        six.map((f) => f.id),
      ),
    );
    expect(tooMany).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await db.announcement.count()).toBe(0); // rolled back

    const foreign = await upload("lec");
    const stolen = await run((ctx) => svc.createAnnouncement(ctx, input, [foreign.id]));
    expect(stolen).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("removes an attachment (soft delete) and refuses files of other announcements", async () => {
    const file = await upload();
    const a = await run((ctx) => svc.createAnnouncement(ctx, input, [file.id]));
    const b = await run((ctx) => svc.createAnnouncement(ctx, input));
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(await run((ctx) => removeAttachment(ctx, b.data.announcementId, file.id))).toMatchObject(
      { ok: false, error: { code: "NOT_FOUND" } },
    );
    expect((await run((ctx) => removeAttachment(ctx, a.data.announcementId, file.id))).ok).toBe(
      true,
    );
    expect(await listAttachments(a.data.announcementId)).toEqual([]);
    expect(await db.storedFile.count()).toBe(1); // kept, flagged deleted
  });
});
