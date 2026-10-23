"use server";

import { z } from "zod";
import { action, DomainError } from "@/lib/actions";
import { jobState } from "./dashboard";
import { getJobs } from "./index";

const retrySchema = z.object({ queue: z.string().min(1).max(120), id: z.string().min(1).max(60) });

/** AC-8: requeue a failed job; anything else is refused. Audited. */
export const retryJobAction = action({
  permission: "plt.jobs.manage",
  input: retrySchema,
  handler: async (input, ctx) => {
    const state = await jobState(input.queue, input.id);
    if (state === null) throw new DomainError("NOT_FOUND", "Job not found");
    if (state !== "failed") throw new DomainError("CONFLICT", "NOT_FAILED");
    const boss = await getJobs().getBoss();
    await boss.retry(input.queue, input.id);
    await ctx.audit({
      action: "plt.job.retry",
      entityType: "Job",
      entityId: input.id,
      after: { queue: input.queue },
    });
    return { id: input.id };
  },
});
