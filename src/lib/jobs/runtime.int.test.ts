import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJobsRuntime,
  JobsUnavailableError,
  sanitizeFailure,
  type JobsRuntime,
} from "./runtime";
import { resolveJob, type ResolvedJob } from "./registry";

// Real pg-boss on the test database. Each test uses its own queue names; the runtime is stopped
// afterwards. pgboss keeps its own schema, so these tests do not depend on the public tables.
const url = () => process.env.DATABASE_URL!;
const unique = () => `t.${Math.random().toString(36).slice(2, 8)}`;
let runtimes: JobsRuntime[] = [];

function runtime(jobs: ResolvedJob[], worker = true) {
  const rt = createJobsRuntime({
    connectionString: url(),
    worker,
    jobs: () => jobs,
    pollingIntervalSeconds: 0.5,
  });
  runtimes.push(rt);
  return rt;
}
const waitFor = async (check: () => boolean | Promise<boolean>, ms = 15_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out waiting for the job system");
};

beforeEach(() => {
  runtimes = [];
});
afterEach(async () => {
  for (const rt of runtimes) await rt.stop();
  vi.restoreAllMocks();
});

describe("running jobs (AC-2, AC-3)", () => {
  it("runs an enqueued job with its data and context", async () => {
    const name = `${unique()}.run`;
    const seen: unknown[] = [];
    const rt = runtime([
      resolveJob({
        name,
        handler: async (data, ctx) => void seen.push([data, ctx.name, ctx.attempt]),
      }),
    ]);
    const id = await rt.enqueue(name, { fileId: "f1" }, { key: "k1" });
    expect(id).toBeTruthy();
    await waitFor(() => seen.length === 1);
    expect(seen[0]).toEqual([{ fileId: "f1" }, name, 0]);
  });

  it("does not create a second job for the same key while the first is waiting or running", async () => {
    const name = `${unique()}.once`;
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const rt = runtime([
      resolveJob({ name, handler: async () => (runs++, gate), expireInSeconds: 60 }),
    ]);

    const first = await rt.enqueue(name, {}, { key: "reminder:42" });
    const dupWhileWaitingOrActive = await rt.enqueue(name, {}, { key: "reminder:42" });
    await waitFor(() => runs === 1);
    const dupWhileActive = await rt.enqueue(name, {}, { key: "reminder:42" });
    expect(first).toBeTruthy();
    expect(dupWhileWaitingOrActive).toBeNull();
    expect(dupWhileActive).toBeNull();

    release();
    await waitFor(async () => (await (await rt.getBoss()).getQueue(name))?.activeCount === 0);
    expect(runs).toBe(1);
  });

  it("different keys are different jobs, and a finished key can be used again", async () => {
    const name = `${unique()}.keys`;
    const seen: string[] = [];
    const rt = runtime([
      resolveJob({ name, handler: async (data: { n?: string }) => void seen.push(data.n ?? "") }),
    ]);
    expect(await rt.enqueue(name, { n: "a" }, { key: "a" })).toBeTruthy();
    expect(await rt.enqueue(name, { n: "b" }, { key: "b" })).toBeTruthy();
    await waitFor(() => seen.length === 2);
    await waitFor(async () => (await (await rt.getBoss()).getQueue(name))?.activeCount === 0);
    expect(await rt.enqueue(name, { n: "a2" }, { key: "a" })).toBeTruthy();
    await waitFor(() => seen.length === 3);
    expect(seen.sort()).toEqual(["a", "a2", "b"]);
  });

  it("delays a job until startAfter", async () => {
    const name = `${unique()}.later`;
    const at: number[] = [];
    const rt = runtime([resolveJob({ name, handler: async () => void at.push(Date.now()) })]);
    const started = Date.now();
    await rt.enqueue(name, {}, { key: "later", startAfter: new Date(started + 2500) });
    await waitFor(() => at.length === 1);
    expect(at[0]! - started).toBeGreaterThanOrEqual(2000);
  });
});

describe("failures (AC-4, AC-5)", () => {
  it("retries a failing job and succeeds on the second attempt", async () => {
    const name = `${unique()}.retry`;
    const attempts: number[] = [];
    const rt = runtime([
      resolveJob({
        name,
        retryLimit: 2,
        retryDelaySeconds: 1,
        retryBackoff: false,
        handler: async (_d, ctx) => {
          attempts.push(ctx.attempt);
          if (ctx.attempt === 0) throw new Error("first attempt fails");
        },
      }),
    ]);
    await rt.enqueue(name, {}, { key: "r" });
    await waitFor(() => attempts.length === 2, 20_000);
    expect(attempts).toEqual([0, 1]);
  });

  it("marks the job failed after the retry limit and keeps no error text (personal data)", async () => {
    const name = `${unique()}.fail`;
    let runs = 0;
    const rt = runtime([
      resolveJob({
        name,
        retryLimit: 1,
        retryDelaySeconds: 1,
        retryBackoff: false,
        handler: async () => {
          runs++;
          throw new Error("could not mail ana.hoxha@logos.edu.al (NIM 12345)");
        },
      }),
    ]);
    await rt.enqueue(name, {}, { key: "f" });
    await waitFor(() => runs === 2, 20_000);
    const boss = await rt.getBoss();
    await waitFor(async () => (await boss.findJobs(name))[0]?.state === "failed", 20_000);
    const [job] = await boss.findJobs(name);
    expect(job?.state).toBe("failed");
    const stored = JSON.stringify(job?.output ?? {});
    expect(stored).not.toContain("ana.hoxha");
    expect(stored).not.toContain("12345");
    expect(stored).toContain("job failed");
  });

  it("does not log the error text either", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => void lines.push(String(line)));
    vi.spyOn(console, "info").mockImplementation((line: string) => void lines.push(String(line)));
    const name = `${unique()}.log`;
    const rt = runtime([
      resolveJob({
        name,
        retryLimit: 0,
        handler: async () => {
          throw new Error("secret@example.org");
        },
      }),
    ]);
    await rt.enqueue(name, {}, { key: "l" });
    await waitFor(() => lines.some((l) => l.includes("job failed")));
    const all = lines.join("\n");
    expect(all).toContain(name);
    expect(all).toContain('"jobId"');
    expect(all).not.toContain("secret@example.org");
  });

  it("sanitizeFailure keeps only the class name", () => {
    class DbTimeout extends Error {}
    DbTimeout.prototype.name = "DbTimeout";
    const out = sanitizeFailure(new DbTimeout("password=hunter2"));
    expect(out.message).toBe("job failed (DbTimeout)");
    expect(out.stack).toBeUndefined();
    expect(sanitizeFailure("a string").message).toBe("job failed (Error)");
    const weird = new Error("x");
    weird.name = "has spaces & symbols!";
    expect(sanitizeFailure(weird).name).toBe("Error");
  });
});

describe("scheduling and the publisher-only mode (AC-2, AC-6)", () => {
  it("registers cron schedules in Europe/Tirane and drops schedules whose job was removed", async () => {
    const kept = `${unique()}.nightly`;
    const gone = `${unique()}.gone`;
    const first = runtime([
      resolveJob({ name: kept, cron: "0 3 * * *", handler: async () => undefined }),
      resolveJob({ name: gone, cron: "5 4 * * *", handler: async () => undefined }),
    ]);
    const boss = await first.getBoss();
    expect((await boss.getSchedules(kept))[0]).toMatchObject({
      cron: "0 3 * * *",
      timezone: "Europe/Tirane",
    });
    expect(await boss.getSchedules(gone)).toHaveLength(1);
    await first.stop();

    const second = runtime([
      resolveJob({ name: kept, cron: "0 3 * * *", handler: async () => undefined }),
    ]);
    const boss2 = await second.getBoss();
    expect(await boss2.getSchedules(gone)).toHaveLength(0);
    expect(await boss2.getSchedules(kept)).toHaveLength(1);
  });

  it("a publisher-only runtime enqueues but never processes or schedules", async () => {
    const name = `${unique()}.pub`;
    let runs = 0;
    const job = resolveJob({ name, cron: "0 3 * * *", handler: async () => void runs++ });
    const publisher = runtime([job], false);
    expect(await publisher.enqueue(name, {}, { key: "p" })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 2000));
    expect(runs).toBe(0);
    expect(await (await publisher.getBoss()).getSchedules(name)).toHaveLength(0);

    // a worker started later picks the job up
    const worker = runtime([job]);
    await worker.start();
    await waitFor(() => runs === 1);
  });
});

describe("start-up failure (AC-11)", () => {
  it("reports an unreachable database as JobsUnavailableError for start and enqueue, without throwing elsewhere", async () => {
    const bad = createJobsRuntime({
      connectionString: "postgresql://nobody:x@127.0.0.1:1/none",
      worker: true,
      jobs: () => [],
    });
    runtimes.push(bad);
    await expect(bad.start()).rejects.toBeInstanceOf(JobsUnavailableError);
    await expect(bad.enqueue("plt.x", {}, { key: "k" })).rejects.toBeInstanceOf(
      JobsUnavailableError,
    );
    expect(bad.lastError).toBeInstanceOf(Error);
  });
});
