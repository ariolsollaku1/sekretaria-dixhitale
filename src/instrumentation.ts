// Validates the environment at server startup (AC-4) instead of at first use, then starts the job
// system (PLT-12). Neither runs during `next build`, which does not call register().
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
    if (process.env.NODE_ENV !== "test") {
      const { startJobs } = await import("@/lib/jobs");
      await startJobs();
    }
  }
}
