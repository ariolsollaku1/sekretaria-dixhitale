import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createJobsRuntime, type EnqueueOptions, type JobsRuntime } from "./runtime";

export { defineJob, listJobs } from "./registry";
export { JobsUnavailableError } from "./runtime";

// One runtime per process; cached on globalThis so dev hot reloads never start a second worker.
const globalForJobs = globalThis as unknown as { __jobsRuntime?: JobsRuntime };

export function getJobs(): JobsRuntime {
  globalForJobs.__jobsRuntime ??= createJobsRuntime({
    connectionString: env.DATABASE_URL,
    worker: env.JOBS_WORKER === "embedded",
  });
  return globalForJobs.__jobsRuntime;
}

/** AC-2: called once from instrumentation. Failure is logged and the web app keeps serving (AC-11). */
export async function startJobs(): Promise<void> {
  await import("./all"); // every module's job declarations
  try {
    await getJobs().start();
    process.once("SIGTERM", () => void getJobs().stop());
    logger.info("jobs started", { worker: env.JOBS_WORKER });
  } catch {
    // createJobsRuntime already logged the cause (class name only)
  }
}

/** AC-3: enqueue a keyed, idempotent job. Throws JobsUnavailableError when the system is down. */
export function enqueue(name: string, data: object, options: EnqueueOptions) {
  return getJobs().enqueue(name, data, options);
}
