import { PgBoss } from "pg-boss";
import { logger } from "@/lib/logger";
import { TIME_ZONE } from "@/lib/i18n/config";
import { listJobs, type ResolvedJob } from "./registry";

export class JobsUnavailableError extends Error {
  constructor(message = "The job system is not available") {
    super(message);
    this.name = "JobsUnavailableError";
  }
}

export type RuntimeOptions = {
  connectionString: string;
  /** false = publisher only: jobs can be enqueued but nothing is processed or scheduled (AC-6). */
  worker: boolean;
  jobs?: () => ResolvedJob[];
  pollingIntervalSeconds?: number;
  schema?: string;
};

export type EnqueueOptions = {
  /**
   * Idempotency key (AC-3): while a job with this name and key is waiting or running, enqueueing
   * it again does nothing. Use something stable like `reminder:<installmentId>:<dueDate>`.
   */
  key: string;
  startAfter?: Date | number;
};

/**
 * AC-5: what is stored when a handler fails. The error's text may contain personal data, so only
 * its class name and a code survive.
 */
export function sanitizeFailure(error: unknown): Error {
  const name = error instanceof Error && /^[A-Za-z]{1,60}$/.test(error.name) ? error.name : "Error";
  const out = new Error(`job failed (${name})`);
  out.name = name;
  out.stack = undefined;
  return out;
}

/** One pg-boss instance plus the declared jobs. `createJobsRuntime` is a factory so tests can run several. */
export function createJobsRuntime(options: RuntimeOptions) {
  let boss: PgBoss | null = null;
  let starting: Promise<PgBoss> | null = null;
  let failed: Error | null = null;

  async function setup(): Promise<PgBoss> {
    const instance = new PgBoss({
      connectionString: options.connectionString,
      schema: options.schema,
      application_name: "sekretari-jobs",
      schedule: options.worker,
    });
    instance.on("error", (error) => logger.error("pg-boss error", { error: error.name }));
    await instance.start();

    const jobs = (options.jobs ?? listJobs)();
    for (const job of jobs) {
      await instance.createQueue(job.name, {
        policy: "exclusive",
        retryLimit: job.retryLimit,
        retryDelay: job.retryDelaySeconds,
        retryBackoff: job.retryBackoff,
        expireInSeconds: job.expireInSeconds,
        deleteAfterSeconds: 14 * 24 * 3600,
      });
    }
    if (options.worker) {
      for (const job of jobs) {
        await instance.work<object>(
          job.name,
          {
            pollingIntervalSeconds: options.pollingIntervalSeconds ?? 5,
            localConcurrency: job.concurrency,
          },
          async (batch) => {
            for (const item of batch) {
              const attempt = (item as { retryCount?: number }).retryCount ?? 0;
              logger.info("job started", { job: job.name, jobId: item.id, attempt });
              try {
                await job.handler(item.data, { jobId: item.id, name: job.name, attempt });
                logger.info("job done", { job: job.name, jobId: item.id });
              } catch (error) {
                logger.error("job failed", {
                  job: job.name,
                  jobId: item.id,
                  attempt,
                  error: error instanceof Error ? error.name : "unknown",
                });
                throw sanitizeFailure(error);
              }
            }
          },
        );
        if (job.cron)
          await instance.schedule(job.name, job.cron, job.cronData ?? {}, { tz: TIME_ZONE });
      }
      // A schedule whose job left the code must stop firing.
      const declared = new Set(jobs.map((j) => j.name));
      for (const s of await instance.getSchedules()) {
        if (!declared.has(s.name)) await instance.unschedule(s.name, s.key);
      }
    }
    return instance;
  }

  return {
    /** Idempotent and serialised: concurrent callers share one start-up (AC-11 when it fails). */
    async start(): Promise<void> {
      if (boss) return;
      starting ??= setup().then(
        (b) => {
          boss = b;
          failed = null;
          return b;
        },
        (error: Error) => {
          starting = null;
          failed = error;
          logger.error("jobs failed to start", { error: error.name });
          throw new JobsUnavailableError();
        },
      );
      await starting;
    },

    async stop(): Promise<void> {
      const current = boss;
      boss = null;
      starting = null;
      if (current) await current.stop({ graceful: true, timeout: 10_000 });
    },

    /** AC-3/AC-11: returns the job id, or null when an identical keyed job is already waiting or running. */
    async enqueue(name: string, data: object, opts: EnqueueOptions): Promise<string | null> {
      try {
        await this.start();
      } catch {
        throw new JobsUnavailableError();
      }
      if (!boss) throw new JobsUnavailableError();
      return boss.send(name, data, {
        singletonKey: opts.key,
        ...(opts.startAfter ? { startAfter: opts.startAfter } : {}),
      });
    },

    /** For the dashboard and tests. */
    async getBoss(): Promise<PgBoss> {
      await this.start();
      if (!boss) throw new JobsUnavailableError();
      return boss;
    },

    get lastError() {
      return failed;
    },
  };
}

export type JobsRuntime = ReturnType<typeof createJobsRuntime>;
