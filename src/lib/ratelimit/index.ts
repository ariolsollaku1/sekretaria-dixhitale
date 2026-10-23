import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export type RateLimit = { limit: number; windowMs: number };

/** A bucket name that carries no raw address: `<scope>:<hash of the ip>`. */
export const bucketFor = (scope: string, ip: string | null): string =>
  `${scope}:${createHash("sha256")
    .update(ip ?? "unknown")
    .digest("hex")
    .slice(0, 32)}`;

/**
 * Sliding window on a database table (so it survives restarts and works across instances).
 * Records the hit and allows it while fewer than `limit` hits fall in the window; refused hits are
 * not recorded, so a blocked client recovers as soon as its old hits age out.
 */
export async function hit(
  bucket: string,
  { limit, windowMs }: RateLimit,
  now = new Date(),
): Promise<{ allowed: boolean; remaining: number }> {
  const since = new Date(now.getTime() - windowMs);
  const recent = await db.rateLimitHit.count({ where: { bucket, at: { gt: since } } });
  if (recent >= limit) return { allowed: false, remaining: 0 };
  await db.rateLimitHit.create({ data: { bucket, at: now } });
  return { allowed: true, remaining: limit - recent - 1 };
}

/** Housekeeping: hits older than `olderThanMs` can no longer matter. */
export async function pruneRateLimit(
  olderThanMs = 24 * 60 * 60 * 1000,
  now = new Date(),
): Promise<number> {
  const result = await db.rateLimitHit.deleteMany({
    where: { at: { lt: new Date(now.getTime() - olderThanMs) } },
  });
  return result.count;
}
