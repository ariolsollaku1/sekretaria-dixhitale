import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { EXPORT_STALE_HOURS, INTEGRITY_STALE_HOURS, KEEP_EXPORTS } from "./constants";
import { isStale } from "./retention";

export type RunRow = {
  id: string;
  kind: "EXPORT" | "INTEGRITY";
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  requested: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  tableCount: number;
  rowCount: number;
  fileCount: number;
  problemCount: number;
  sizeBytes: number | null;
  errorCode: string | null;
  /** AC-10: a download link exists only for a retained, successful export. */
  downloadable: boolean;
};

export type BackupOverview = {
  runs: RunRow[];
  latestExport: RunRow | null;
  latestIntegrity: RunRow | null;
  exportStale: boolean;
  integrityStale: boolean;
  /** A run has been requested or is running right now. */
  pending: number;
  keep: number;
};

/** Job-system rows for the two backup queues that are waiting or running (0 if unreadable). */
async function pendingJobs(): Promise<number> {
  try {
    const rows = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM pgboss.job
      WHERE name IN ('plt.backup.export', 'plt.backup.integrity')
        AND state::text IN ('created', 'retry', 'active')`);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

/** AC-8: status of the latest runs and the 50 most recent. */
export async function backupOverview(now: Date = new Date()): Promise<BackupOverview> {
  const [rows, lastExportOk, lastIntegrityOk, pending] = await Promise.all([
    db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 }),
    db.backupRun.findFirst({
      where: { kind: "EXPORT", status: "SUCCEEDED" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    db.backupRun.findFirst({
      where: { kind: "INTEGRITY", status: "SUCCEEDED" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    pendingJobs(),
  ]);
  const runs: RunRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    requested: r.requestedById !== null,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    tableCount: r.tableCount,
    rowCount: r.rowCount,
    fileCount: r.fileCount,
    problemCount: r.problemCount,
    sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
    errorCode: r.errorCode,
    downloadable:
      r.kind === "EXPORT" && r.status === "SUCCEEDED" && !!r.fileName && r.purgedAt === null,
  }));
  return {
    runs,
    latestExport: runs.find((r) => r.kind === "EXPORT") ?? null,
    latestIntegrity: runs.find((r) => r.kind === "INTEGRITY") ?? null,
    exportStale: isStale(lastExportOk?.startedAt ?? null, EXPORT_STALE_HOURS, now),
    integrityStale: isStale(lastIntegrityOk?.startedAt ?? null, INTEGRITY_STALE_HOURS, now),
    pending,
    keep: KEEP_EXPORTS,
  };
}
