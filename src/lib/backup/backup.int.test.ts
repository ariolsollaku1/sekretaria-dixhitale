import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getJob } from "@/lib/jobs/registry";
import { LocalStorage } from "@/lib/storage/local";
import { applyRetention, runExport, startRun } from "./export.service";
import { runIntegrity } from "./integrity.service";
import type { Manifest } from "./manifest";
import "./jobs";

let filesDir: string;
let exportsDir: string;
let storage: LocalStorage;
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

beforeEach(async () => {
  filesDir = await mkdtemp(join(tmpdir(), "bk-files-"));
  exportsDir = await mkdtemp(join(tmpdir(), "bk-exports-"));
  storage = new LocalStorage(filesDir);
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "stored_files", "backup_runs", "system_settings"',
  );
});
afterEach(async () => {
  await rm(filesDir, { recursive: true, force: true });
  await rm(exportsDir, { recursive: true, force: true });
});

async function addFile(id: string, bytes: Uint8Array, fileName: string, recordedSha = sha(bytes)) {
  const key = `2026/10/${id}`;
  await storage.put(key, bytes);
  await db.storedFile.create({
    data: {
      id,
      storageKey: key,
      purpose: "general",
      fileName,
      mimeType: "application/pdf",
      size: bytes.length,
      sha256: recordedSha,
      uploadedById: "u1",
    },
  });
}

async function exportOnce() {
  const run = await startRun("EXPORT", null);
  await runExport(run.id, { exportsDir, storage });
  const done = await db.backupRun.findUniqueOrThrow({ where: { id: run.id } });
  const zip = unzipSync(new Uint8Array(await readFile(join(exportsDir, done.fileName!))));
  return { run: done, zip };
}

describe("full export (PLT-13 AC-1..AC-5)", () => {
  it("writes csv, jsonl, files, manifest and readme, with matching hashes and a run log", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);
    await addFile("aaaaaaaaaaaaaaaaaaaaaaaa", pdf, "Çertifikatë 1.pdf");
    await db.systemSetting.create({
      data: { key: 'k,"1"\nx', value: { emri: 'Çmim, "i" ri' } },
    });

    const { run, zip } = await exportOnce();

    expect(run).toMatchObject({ status: "SUCCEEDED", errorCode: null, problemCount: 0 });
    expect(run.fileCount).toBe(1);
    expect(run.tableCount).toBeGreaterThan(20);
    expect(Number(run.sizeBytes)).toBeGreaterThan(0);
    expect(run.sha256).toBe(sha(await readFile(join(exportsDir, run.fileName!))));

    const names = Object.keys(zip);
    expect(names).toEqual(
      expect.arrayContaining([
        "csv/system_settings.csv",
        "jsonl/system_settings.jsonl",
        "csv/stored_files.csv",
        "csv/audit_logs.csv",
        "manifest.json",
        "README.txt",
      ]),
    );
    // AC-3: nothing secret
    for (const t of [
      "sessions",
      "accounts",
      "verifications",
      "calendar_feed_tokens",
      "backup_runs",
    ])
      expect(names).not.toContain(`csv/${t}.csv`);
    expect(names.some((n) => n.startsWith("jsonl/sessions"))).toBe(false);

    // CSV: header + quoted row with comma, quotes and newline; UTF-8 intact
    const csv = strFromU8(zip["csv/system_settings.csv"]!);
    expect(csv.startsWith("key,value,updated_at,updated_by_id\r\n")).toBe(true);
    expect(csv).toContain('"k,""1""\nx"');
    expect(csv).toContain("Çmim");
    // JSONL: exact values, one object per line
    const lines = strFromU8(zip["jsonl/system_settings.jsonl"]!).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      key: 'k,"1"\nx',
      value: { emri: 'Çmim, "i" ri' },
    });

    // files and manifest
    const manifest = JSON.parse(strFromU8(zip["manifest.json"]!)) as Manifest;
    expect(manifest.format).toBe("logos-export/1");
    const entry = manifest.files[0]!;
    expect(entry).toMatchObject({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", status: "ok", sha256: sha(pdf) });
    expect(zip[entry.path!]).toEqual(pdf);
    const settings = manifest.tables.find((t) => t.table === "system_settings")!;
    expect(settings.rows).toBe(1);
    expect(settings.csvSha256).toBe(sha(zip["csv/system_settings.csv"]!));
    expect(settings.jsonlSha256).toBe(sha(zip["jsonl/system_settings.jsonl"]!));
    expect(manifest.tables.find((t) => t.table === "audit_logs")).toBeDefined();

    // AC-11: audited
    const audit = await db.auditLog.findFirst({ where: { action: "plt.backup.export" } });
    expect(audit).toMatchObject({ actorType: "SYSTEM", entityId: run.id });
    expect(await readdir(exportsDir)).toEqual([run.fileName]); // no .part left
  });

  it("an empty table still has a header; a user-started run is audited as the user", async () => {
    const run = await startRun("EXPORT", "user-1");
    await runExport(run.id, { exportsDir, storage });
    const done = await db.backupRun.findUniqueOrThrow({ where: { id: run.id } });
    const zip = unzipSync(new Uint8Array(await readFile(join(exportsDir, done.fileName!))));
    expect(strFromU8(zip["csv/stored_files.csv"]!)).toMatch(/^id,storage_key,/);
    expect(strFromU8(zip["jsonl/stored_files.jsonl"]!)).toBe("");
    const audit = await db.auditLog.findFirst({ where: { action: "plt.backup.export" } });
    expect(audit).toMatchObject({ actorType: "USER", actorUserId: "user-1" });
  });

  it("lists missing and corrupt files and leaves them out (AC-4)", async () => {
    await addFile("bbbbbbbbbbbbbbbbbbbbbbbb", new Uint8Array([1, 2, 3]), "good.pdf");
    await addFile("cccccccccccccccccccccccc", new Uint8Array([9, 9]), "bad.pdf", "0".repeat(64));
    await addFile("dddddddddddddddddddddddd", new Uint8Array([4]), "gone.pdf");
    await storage.delete("2026/10/dddddddddddddddddddddddd");

    const { run, zip } = await exportOnce();
    const manifest = JSON.parse(strFromU8(zip["manifest.json"]!)) as Manifest;
    const status = Object.fromEntries(manifest.files.map((f) => [f.id[0], f.status]));
    expect(status).toEqual({ b: "ok", c: "corrupt", d: "missing" });
    expect(Object.keys(zip).filter((n) => n.startsWith("files/"))).toHaveLength(1);
    expect(run).toMatchObject({ fileCount: 1, problemCount: 2, status: "SUCCEEDED" });
  });

  it("a soft-deleted file is not exported", async () => {
    await addFile("eeeeeeeeeeeeeeeeeeeeeeee", new Uint8Array([7]), "x.pdf");
    await db.storedFile.updateMany({ data: { deletedAt: new Date() } });
    const { zip } = await exportOnce();
    const manifest = JSON.parse(strFromU8(zip["manifest.json"]!)) as Manifest;
    expect(manifest.files).toEqual([]);
  });

  it("stores only a short code on failure and leaves nothing behind (AC-5)", async () => {
    const blocker = join(exportsDir, "not-a-folder");
    await writeFile(blocker, "x");
    const run = await startRun("EXPORT", null);
    await expect(runExport(run.id, { exportsDir: blocker, storage })).rejects.toThrow();
    const done = await db.backupRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(done).toMatchObject({ status: "FAILED", errorCode: "STORAGE", fileName: null });
    expect(done.finishedAt).not.toBeNull();
    expect((await stat(blocker)).isFile()).toBe(true);
  });

  it("marks a run left running by a crash as interrupted", async () => {
    const stale = await startRun("EXPORT", null);
    await exportOnce();
    const row = await db.backupRun.findUniqueOrThrow({ where: { id: stale.id } });
    expect(row).toMatchObject({ status: "FAILED", errorCode: "INTERRUPTED" });
  });
});

describe("retention (AC-6)", () => {
  it("keeps the newest N exports, deletes older ZIPs and marks the rows purged", async () => {
    const make = async (day: number) => {
      const fileName = `export-2026100${day}-000000-aaaaaa.zip`;
      await writeFile(join(exportsDir, fileName), "zip");
      return db.backupRun.create({
        data: {
          kind: "EXPORT",
          status: "SUCCEEDED",
          fileName,
          sha256: sha("zip"),
          startedAt: new Date(Date.UTC(2026, 9, day)),
        },
      });
    };
    const runs = [await make(1), await make(2), await make(3), await make(4)];
    expect(await applyRetention(exportsDir, 2)).toBe(2);
    const rows = await db.backupRun.findMany({ orderBy: { startedAt: "asc" } });
    expect(rows.map((r) => r.purgedAt !== null)).toEqual([true, true, false, false]);
    expect((await readdir(exportsDir)).sort()).toEqual(
      [runs[2]!.fileName, runs[3]!.fileName].sort(),
    );
    expect(await applyRetention(exportsDir, 2)).toBe(0);
  });
});

describe("integrity check (AC-7)", () => {
  it("passes when files and exports are intact", async () => {
    await addFile("ffffffffffffffffffffffff", new Uint8Array([1]), "a.pdf");
    await exportOnce();
    const run = await startRun("INTEGRITY", null);
    const result = await runIntegrity(run.id, { exportsDir, storage });
    expect(result).toEqual({ files: 1, exports: 1, problems: 0 });
    expect(await db.backupRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      status: "SUCCEEDED",
      problemCount: 0,
      errorCode: null,
    });
    expect(await db.auditLog.count({ where: { action: "plt.backup.integrity" } })).toBe(1);
  });

  it("fails and counts a modified file, a missing file and a tampered export", async () => {
    await addFile("111111111111111111111111", new Uint8Array([1]), "a.pdf");
    await addFile("222222222222222222222222", new Uint8Array([2]), "b.pdf");
    await addFile("333333333333333333333333", new Uint8Array([3]), "c.pdf");
    const { run: exp } = await exportOnce();
    await storage.put("2026/10/111111111111111111111111", new Uint8Array([99])); // modified
    await storage.delete("2026/10/222222222222222222222222"); // missing
    await writeFile(join(exportsDir, exp.fileName!), "tampered"); // export changed

    const run = await startRun("INTEGRITY", "user-1");
    const result = await runIntegrity(run.id, { exportsDir, storage });
    expect(result).toEqual({ files: 3, exports: 1, problems: 3 });
    expect(await db.backupRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      status: "FAILED",
      errorCode: "PROBLEMS",
      problemCount: 3,
    });
  });

  it("flags a retained export that disappeared", async () => {
    const { run: exp } = await exportOnce();
    await rm(join(exportsDir, exp.fileName!));
    const run = await startRun("INTEGRITY", null);
    expect((await runIntegrity(run.id, { exportsDir, storage })).problems).toBe(1);
  });
});

describe("jobs", () => {
  it("are declared with their schedules and no automatic retry", () => {
    expect(getJob("plt.backup.export")).toMatchObject({ cron: "30 2 * * *", retryLimit: 0 });
    expect(getJob("plt.backup.integrity")).toMatchObject({ cron: "0 4 * * 0", retryLimit: 0 });
  });
});
