import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";

/** AC-8: true when a trivial query succeeds within `timeoutMs`. Never throws, never logs the error body. */
export async function isDatabaseReachable(
  client: PrismaClient,
  timeoutMs = 2000,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.$queryRaw`select 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
