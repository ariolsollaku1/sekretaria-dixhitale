// Validates the environment at server startup (AC-4) instead of at first use.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
