import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bucketFor, hit, pruneRateLimit } from "./index";

beforeEach(async () => {
  await db.rateLimitHit.deleteMany();
});

describe("rate limit (PLT-15 AC-6)", () => {
  const rule = { limit: 3, windowMs: 10 * 60_000 };
  const t0 = new Date("2026-10-23T10:00:00Z");
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);

  it("allows `limit` hits per window, refuses the next, and recovers as hits age out", async () => {
    const bucket = bucketFor("form:x", "203.0.113.5");
    expect((await hit(bucket, rule, at(0))).remaining).toBe(2);
    expect((await hit(bucket, rule, at(1))).remaining).toBe(1);
    expect((await hit(bucket, rule, at(2))).remaining).toBe(0);
    expect(await hit(bucket, rule, at(3))).toEqual({ allowed: false, remaining: 0 });
    expect(await hit(bucket, rule, at(9))).toEqual({ allowed: false, remaining: 0 });
    // the first hit leaves the window at minute 10
    expect((await hit(bucket, rule, at(10.5))).allowed).toBe(true);
    // refused hits were not recorded: only 4 rows exist
    expect(await db.rateLimitHit.count()).toBe(4);
  });

  it("keeps buckets apart and stores no raw address", async () => {
    const a = bucketFor("form:x", "203.0.113.5");
    const b = bucketFor("form:x", "203.0.113.6");
    const c = bucketFor("form:y", "203.0.113.5");
    expect(new Set([a, b, c]).size).toBe(3);
    for (const bucket of [a, b, c]) expect(bucket).not.toContain("203.0.113");
    for (let i = 0; i < 3; i++) await hit(a, rule, at(0));
    expect((await hit(a, rule, at(1))).allowed).toBe(false);
    expect((await hit(b, rule, at(1))).allowed).toBe(true);
    expect((await hit(c, rule, at(1))).allowed).toBe(true);
  });

  it("prunes old hits", async () => {
    await hit("old", rule, new Date("2026-10-20T00:00:00Z"));
    await hit("new", rule, at(0));
    expect(await pruneRateLimit(24 * 60 * 60 * 1000, at(60))).toBe(1);
    expect(await db.rateLimitHit.count()).toBe(1);
  });
});
