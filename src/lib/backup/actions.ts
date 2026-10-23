"use server";

import { z } from "zod";
import { action, DomainError } from "@/lib/actions";
import { enqueue, JobsUnavailableError } from "@/lib/jobs";
import "@/lib/authz/permissions";

const input = z.object({ kind: z.enum(["export", "integrity"]) });
const QUEUE = { export: "plt.backup.export", integrity: "plt.backup.integrity" } as const;

/** AC-9: queue a run now. A second one while one is waiting or running is refused. */
export const startBackupRunAction = action({
  permission: "plt.backup.manage",
  input,
  handler: async ({ kind }, ctx) => {
    let id: string | null;
    try {
      id = await enqueue(QUEUE[kind], { requestedById: ctx.user.id }, { key: "manual" });
    } catch (error) {
      if (error instanceof JobsUnavailableError) throw new DomainError("UNAVAILABLE", "JOBS_DOWN");
      throw error;
    }
    if (id === null) throw new DomainError("CONFLICT", "ALREADY_QUEUED");
    await ctx.audit({
      action: "plt.backup.request",
      entityType: "BackupRun",
      after: { kind },
    });
    return { queued: true };
  },
});
