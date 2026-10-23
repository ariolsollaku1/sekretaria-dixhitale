import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({
  user: null as { id: string; email: string; name: string; locale: null; personId: null } | null,
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => current.user,
  requireUser: async () => current.user,
}));

import { db } from "@/lib/db";
import { jobState, queueOverview, recentJobs } from "./dashboard";
import { getJobs } from "./index";
import { retryJobAction } from "./jobs.actions";
import { defineJob, resetJobs } from "./registry";

// The shared runtime polls every 5 s, so give the tests room.
vi.setConfig({ testTimeout: 45_000, hookTimeout: 45_000 });

const FAIL = `t.dash${Math.random().toString(36).slice(2, 6)}.fail`;
const OK = `t.dash${Math.random().toString(36).slice(2, 6)}.ok`;
let attempts = 0;
let failUntil = Infinity;

const waitFor = async (check: () => boolean | Promise<boolean>, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("timed out");
};

async function makeUser(email: string, sysadmin: boolean) {
  const u = await db.user.create({ data: { email, name: email } });
  if (sysadmin)
    await db.userRole.create({
      data: { userId: u.id, role: "sysadmin", scopeType: "INSTITUTION" },
    });
  return { id: u.id, email, name: email, locale: null, personId: null } as const;
}

beforeAll(async () => {
  resetJobs();
  defineJob({
    name: FAIL,
    retryLimit: 0,
    cron: "0 3 * * *",
    handler: async () => {
      attempts++;
      if (attempts <= failUntil) throw new Error("boom");
    },
  });
  defineJob({ name: OK, handler: async () => undefined });
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "user_roles"');
  await db.user.deleteMany();
  await getJobs().start();
});
afterAll(async () => {
  await getJobs().stop();
  resetJobs();
});

describe("dashboard (AC-7)", () => {
  it("lists declared queues with their schedule and counts, and recent jobs newest first with filters", async () => {
    const runtime = getJobs();
    await runtime.enqueue(OK, {}, { key: "ok-1" });
    await runtime.enqueue(FAIL, {}, { key: "fail-1" });
    const boss = await runtime.getBoss();
    await waitFor(async () => (await recentJobs({ queue: FAIL }))[0]?.state === "failed");
    await waitFor(async () => (await recentJobs({ queue: OK }))[0]?.state === "completed");

    const queues = await queueOverview();
    expect(queues.map((q) => q.name)).toEqual([FAIL, OK].sort());
    expect(queues.find((q) => q.name === FAIL)).toMatchObject({ cron: "0 3 * * *", failed: 1 });
    expect(queues.find((q) => q.name === OK)).toMatchObject({ cron: null, failed: 0 });

    const all = await recentJobs();
    expect(all.map((j) => j.state).sort()).toEqual(["completed", "failed"]);
    expect(all[0]!.createdOn.getTime()).toBeGreaterThanOrEqual(all[1]!.createdOn.getTime());
    expect((await recentJobs({ state: "failed" })).map((j) => j.name)).toEqual([FAIL]);
    expect((await recentJobs({ queue: OK })).map((j) => j.name)).toEqual([OK]);
    expect(await recentJobs({ queue: "plt.not-declared" })).toHaveLength(2); // unknown queue filter is ignored
    expect(await recentJobs({ state: "nonsense" })).toHaveLength(2);
    void boss;
  });

  it("jobState only answers for declared queues and valid ids", async () => {
    const [failed] = await recentJobs({ state: "failed" });
    expect(await jobState(FAIL, failed!.id)).toBe("failed");
    expect(await jobState("plt.other", failed!.id)).toBeNull();
    expect(await jobState(FAIL, "not-a-uuid")).toBeNull();
    expect(await jobState(FAIL, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("retry (AC-8, AC-10)", () => {
  it("requeues a failed job, audits it, and refuses jobs that are not failed", async () => {
    const [failed] = await recentJobs({ state: "failed" });
    const [completed] = await recentJobs({ state: "completed" });
    current.user = await makeUser("admin@t.test", true);

    failUntil = 0; // the retried run succeeds
    expect(await retryJobAction({ queue: FAIL, id: completed!.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await retryJobAction({ queue: OK, id: completed!.id })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "NOT_FAILED" },
    });
    expect(await retryJobAction({ queue: FAIL, id: failed!.id })).toEqual({
      ok: true,
      data: { id: failed!.id },
    });
    await waitFor(async () => (await jobState(FAIL, failed!.id)) === "completed");
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "plt.job.retry" } }),
    ).toMatchObject({ entityId: failed!.id, after: { queue: FAIL } });
    expect(await retryJobAction({ queue: FAIL, id: failed!.id })).toMatchObject({
      ok: false,
      error: { message: "NOT_FAILED" },
    });
  });

  it("is limited to the manage permission", async () => {
    current.user = await makeUser("sec@t.test", false);
    expect(
      await retryJobAction({ queue: FAIL, id: "00000000-0000-4000-8000-000000000000" }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    current.user = null;
    expect(await retryJobAction({ queue: FAIL, id: "x" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
