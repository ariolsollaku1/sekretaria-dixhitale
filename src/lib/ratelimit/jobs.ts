import "server-only";
import { defineJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";
import { pruneRateLimit } from "./index";

export const rateLimitPruneJob = defineJob({
  name: "plt.ratelimit.prune",
  cron: "17 * * * *",
  retryLimit: 0,
  handler: async () => {
    const count = await pruneRateLimit();
    if (count > 0) logger.info("rate limit hits pruned", { count });
  },
});
