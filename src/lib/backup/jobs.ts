import "server-only";
import { defineJob } from "@/lib/jobs/registry";
import { EXPORT_CRON, INTEGRITY_CRON } from "./constants";
import { runExport, startRun } from "./export.service";
import { runIntegrity } from "./integrity.service";

type RunData = { requestedById?: string | null };

// SRC-150/151, PLT-13 AC-1: the nightly full export; also enqueued by a sysadmin ("run now").
// No automatic retry: a failed export is shown on /admin/backups and can be started again.
export const exportJob = defineJob<RunData>({
  name: "plt.backup.export",
  cron: EXPORT_CRON,
  retryLimit: 0,
  expireInSeconds: 6 * 3600,
  handler: async (data) => {
    const run = await startRun("EXPORT", data?.requestedById ?? null);
    await runExport(run.id);
  },
});

// PLT-13 AC-7: weekly check that stored files and retained exports are still intact.
export const integrityJob = defineJob<RunData>({
  name: "plt.backup.integrity",
  cron: INTEGRITY_CRON,
  retryLimit: 0,
  expireInSeconds: 3 * 3600,
  handler: async (data) => {
    const run = await startRun("INTEGRITY", data?.requestedById ?? null);
    await runIntegrity(run.id);
  },
});
