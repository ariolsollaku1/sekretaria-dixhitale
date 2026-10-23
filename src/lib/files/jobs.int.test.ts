import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getJob } from "@/lib/jobs/registry";
import { LocalStorage } from "@/lib/storage/local";
import { setStorage } from "@/lib/storage";
import "./jobs";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jobs-"));
  setStorage(new LocalStorage(dir));
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "stored_files"');
});
afterEach(async () => {
  setStorage(undefined);
  await rm(dir, { recursive: true, force: true });
});

describe("plt.files.cleanup-orphans (PLT-12 AC-9)", () => {
  it("is declared with the nightly cron", () => {
    expect(getJob("plt.files.cleanup-orphans")).toMatchObject({ cron: "0 3 * * *", retryLimit: 2 });
  });

  it("removes old pending files when the handler runs, and nothing the second time", async () => {
    const storage = new LocalStorage(dir);
    await storage.put("2026/01/aaaaaaaaaaaaaaaaaaaaaaaa", new Uint8Array([1]));
    await db.storedFile.create({
      data: {
        id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        storageKey: "2026/01/aaaaaaaaaaaaaaaaaaaaaaaa",
        purpose: "general",
        fileName: "x.pdf",
        mimeType: "application/pdf",
        size: 1,
        sha256: "0".repeat(64),
        uploadedById: "u1",
        createdAt: new Date(Date.now() - 48 * 3_600_000),
      },
    });
    const job = getJob("plt.files.cleanup-orphans")!;
    await job.handler({}, { jobId: "j1", name: job.name, attempt: 0 });
    expect(await db.storedFile.count()).toBe(0);
    expect(await storage.exists("2026/01/aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    await expect(
      job.handler({}, { jobId: "j2", name: job.name, attempt: 0 }),
    ).resolves.toBeUndefined();
  });
});
