import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({
  user: null as { id: string; email: string; name: string; locale: null; personId: null } | null,
}));
// The job system only publishes here (nothing runs), exports would go to this folder.
const filesDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "bk-web-"));
  process.env.FILES_DIR = dir;
  process.env.JOBS_WORKER = "off";
  return dir;
});
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => current.user,
  requireUser: async () => current.user,
}));

import { GET } from "@/app/api/admin/backups/[id]/route";
import { db } from "@/lib/db";
import { getJobs } from "@/lib/jobs";
import { startBackupRunAction } from "./actions";
import { exportsDir } from "./export.service";
import { backupOverview } from "./queries";
import "./jobs";

async function makeUser(email: string, sysadmin: boolean) {
  const u = await db.user.create({ data: { email, name: email } });
  if (sysadmin)
    await db.userRole.create({
      data: { userId: u.id, role: "sysadmin", scopeType: "INSTITUTION" },
    });
  return { id: u.id, email, name: email, locale: null, personId: null } as const;
}
const download = (id: string) =>
  GET(new Request(`http://localhost/api/admin/backups/${id}`), { params: Promise.resolve({ id }) });

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "backup_runs"');
  await db.userRole.deleteMany();
  await db.user.deleteMany();
  await db
    .$executeRawUnsafe(`DELETE FROM pgboss.job WHERE name LIKE 'plt.backup.%'`)
    .catch(() => {});
  current.user = null;
});
afterAll(async () => {
  await getJobs().stop();
  await rm(filesDir, { recursive: true, force: true });
});

describe("start action (AC-9, AC-11)", () => {
  it("queues once, refuses a duplicate, audits; non-sysadmin is forbidden", async () => {
    current.user = await makeUser("plain@t.test", false);
    expect(await startBackupRunAction({ kind: "export" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    current.user = await makeUser("root@t.test", true);
    expect(await startBackupRunAction({ kind: "export" })).toEqual({
      ok: true,
      data: { queued: true },
    });
    expect(await startBackupRunAction({ kind: "export" })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "ALREADY_QUEUED" },
    });
    // the other kind has its own queue
    expect(await startBackupRunAction({ kind: "integrity" })).toMatchObject({ ok: true });
    expect(await startBackupRunAction({ kind: "nope" as never })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await db.auditLog.count({ where: { action: "plt.backup.request" } })).toBe(2);
    expect((await backupOverview()).pending).toBe(2);
  });
});

describe("download route (AC-10, AC-11)", () => {
  async function exportRow(overrides: Record<string, unknown> = {}) {
    const fileName = "export-20261024-023000-abcdef12.zip";
    await mkdir(exportsDir(), { recursive: true });
    await writeFile(join(exportsDir(), fileName), "PK-test-bytes");
    return db.backupRun.create({
      data: { kind: "EXPORT", status: "SUCCEEDED", fileName, sha256: "x", ...overrides },
    });
  }

  it("401 without a session, 403 for a non-sysadmin", async () => {
    const row = await exportRow();
    expect((await download(row.id)).status).toBe(401);
    current.user = await makeUser("plain@t.test", false);
    expect((await download(row.id)).status).toBe(403);
    expect(await db.auditLog.count({ where: { action: "plt.backup.download" } })).toBe(0);
  });

  it("streams the ZIP with safe headers and audits the download", async () => {
    const row = await exportRow();
    current.user = await makeUser("root@t.test", true);
    const res = await download(row.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("PK-test-bytes");
    expect(await db.auditLog.findFirst({ where: { action: "plt.backup.download" } })).toMatchObject(
      { entityId: row.id, actorUserId: current.user.id },
    );
  });

  it("404 for unknown, purged, failed, integrity and file-less runs", async () => {
    current.user = await makeUser("root@t.test", true);
    expect((await download("nope")).status).toBe(404);
    expect((await download((await exportRow({ purgedAt: new Date() })).id)).status).toBe(404);
    expect((await download((await exportRow({ status: "FAILED" })).id)).status).toBe(404);
    expect((await download((await exportRow({ kind: "INTEGRITY" })).id)).status).toBe(404);
    const gone = await db.backupRun.create({
      data: {
        kind: "EXPORT",
        status: "SUCCEEDED",
        fileName: "export-20261024-023000-ffffff12.zip",
      },
    });
    expect((await download(gone.id)).status).toBe(404);
    const bad = await exportRow({ fileName: "../../etc/passwd" });
    expect((await download(bad.id)).status).toBe(404);
  });
});

describe("overview (AC-8)", () => {
  it("flags staleness and exposes downloadable exports", async () => {
    const empty = await backupOverview();
    expect(empty).toMatchObject({ exportStale: true, integrityStale: true, runs: [] });

    const now = new Date();
    await db.backupRun.create({
      data: { kind: "EXPORT", status: "SUCCEEDED", fileName: "export-x.zip", startedAt: now },
    });
    await db.backupRun.create({
      data: { kind: "INTEGRITY", status: "FAILED", startedAt: now, errorCode: "PROBLEMS" },
    });
    const o = await backupOverview();
    expect(o.exportStale).toBe(false);
    expect(o.integrityStale).toBe(true); // the only integrity run failed
    expect(o.latestIntegrity?.status).toBe("FAILED");
    expect(o.runs.find((r) => r.kind === "EXPORT")?.downloadable).toBe(true);
    expect(o.runs.find((r) => r.kind === "INTEGRITY")?.downloadable).toBe(false);
  });
});
