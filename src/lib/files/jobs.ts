import "server-only";
import { defineJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";
import { cleanupOrphans } from "./files.service";

// PLT-08 AC-11 scheduled by PLT-12 AC-9: purge uploads that were never attached, nightly at 03:00
// Europe/Tirane. Idempotent: running it twice removes nothing the second time.
export const cleanupOrphansJob = defineJob({
  name: "plt.files.cleanup-orphans",
  cron: "0 3 * * *",
  retryLimit: 2,
  handler: async () => {
    const removed = await cleanupOrphans();
    logger.info("orphan files purged", { removed });
  },
});
