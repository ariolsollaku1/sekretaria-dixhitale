import "server-only";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createAuditor } from "@/lib/audit";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getStorage } from "@/lib/storage";
import type { Storage } from "@/lib/storage/storage";
import { exportsDir, failInterrupted, failureCode } from "./export.service";

export type IntegrityDeps = { exportsDir?: string; storage?: Storage };

async function hashFile(path: string): Promise<string | null> {
  try {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest("hex");
  } catch {
    return null;
  }
}

/**
 * AC-7: every non-deleted stored file must exist with the recorded SHA-256, and every retained
 * export must exist with the hash recorded by its run. Only counts are stored; the ids of bad
 * files are logged (ids are not personal data).
 */
export async function runIntegrity(runId: string, deps: IntegrityDeps = {}) {
  const storage = deps.storage ?? getStorage();
  const dir = deps.exportsDir ?? exportsDir();
  const run = await db.backupRun.findUniqueOrThrow({ where: { id: runId } });
  const actor = run.requestedById
    ? ({ type: "USER", userId: run.requestedById } as const)
    : ({ type: "SYSTEM" } as const);
  try {
    await failInterrupted("INTEGRITY", runId);
    let checkedFiles = 0;
    let problems = 0;
    const bad: string[] = [];

    const files = await db.storedFile.findMany({
      where: { deletedAt: null },
      select: { id: true, storageKey: true, sha256: true },
      orderBy: { createdAt: "asc" },
    });
    for (const file of files) {
      checkedFiles += 1;
      let ok = false;
      try {
        ok =
          createHash("sha256")
            .update(await storage.read(file.storageKey))
            .digest("hex") === file.sha256;
      } catch {
        ok = false;
      }
      if (!ok) {
        problems += 1;
        bad.push(file.id);
      }
    }

    const exports = await db.backupRun.findMany({
      where: { kind: "EXPORT", status: "SUCCEEDED", purgedAt: null, fileName: { not: null } },
      select: { id: true, fileName: true, sha256: true },
    });
    for (const exp of exports) {
      const actual = await hashFile(join(dir, exp.fileName as string));
      if (actual === null || actual !== exp.sha256) {
        problems += 1;
        bad.push(exp.id);
      }
    }

    await db.backupRun.update({
      where: { id: runId },
      data: {
        status: problems === 0 ? "SUCCEEDED" : "FAILED",
        errorCode: problems === 0 ? null : "PROBLEMS",
        finishedAt: new Date(),
        fileCount: checkedFiles,
        tableCount: exports.length, // exports checked
        problemCount: problems,
      },
    });
    await createAuditor(
      db,
      actor,
    )({
      action: "plt.backup.integrity",
      entityType: "BackupRun",
      entityId: runId,
      after: { files: checkedFiles, exports: exports.length, problems },
    });
    if (problems > 0)
      logger.error("integrity problems found", {
        runId,
        problems,
        ids: bad.slice(0, 50).join(","),
      });
    else logger.info("integrity check passed", { runId, files: checkedFiles });
    return { files: checkedFiles, exports: exports.length, problems };
  } catch (error) {
    const code = failureCode(error);
    await db.backupRun
      .update({
        where: { id: runId },
        data: { status: "FAILED", errorCode: code, finishedAt: new Date() },
      })
      .catch(() => undefined);
    logger.error("integrity check failed", { runId, code });
    throw error;
  }
}
