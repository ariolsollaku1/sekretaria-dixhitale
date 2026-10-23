// AC-1: job declarations. Pure validation, no pg-boss here, so it is unit-tested without a database.
export type JobContext = { jobId: string; name: string; attempt: number };

export type JobDef<Data extends object = object> = {
  /** `<module>.<job>`, lower case, e.g. `plt.files.cleanup-orphans` */
  name: string;
  /** Idempotent by design: it may run again after a crash or a retry. */
  handler: (data: Data, ctx: JobContext) => Promise<unknown>;
  /** Extra attempts after the first failure (default 3). */
  retryLimit?: number;
  retryDelaySeconds?: number;
  retryBackoff?: boolean;
  /** A job active longer than this is considered stuck and retried (default 15 minutes). */
  expireInSeconds?: number;
  /** Jobs of this queue processed in parallel by this process (default 1). */
  concurrency?: number;
  /** 5-field cron expression, interpreted in Europe/Tirane. */
  cron?: string;
  cronData?: object;
};

export type ResolvedJob = Required<
  Pick<
    JobDef,
    | "name"
    | "handler"
    | "retryLimit"
    | "retryDelaySeconds"
    | "retryBackoff"
    | "expireInSeconds"
    | "concurrency"
  >
> &
  Pick<JobDef, "cron" | "cronData">;

export const NAME_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/;
const CRON_PATTERN = /^\S+(\s+\S+){4}$/;

const jobs = new Map<string, ResolvedJob>();

function inRange(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function resolveJob<Data extends object>(def: JobDef<Data>): ResolvedJob {
  if (!NAME_PATTERN.test(def.name))
    throw new Error(`Invalid job name "${def.name}" (use <module>.<job>)`);
  const resolved: ResolvedJob = {
    name: def.name,
    handler: def.handler as ResolvedJob["handler"],
    retryLimit: def.retryLimit ?? 3,
    retryDelaySeconds: def.retryDelaySeconds ?? 30,
    retryBackoff: def.retryBackoff ?? true,
    expireInSeconds: def.expireInSeconds ?? 900,
    concurrency: def.concurrency ?? 1,
    cron: def.cron,
    cronData: def.cronData,
  };
  if (!inRange(resolved.retryLimit, 0, 20))
    throw new Error(`${def.name}: retryLimit must be 0..20`);
  if (!inRange(resolved.retryDelaySeconds, 0, 3600))
    throw new Error(`${def.name}: retryDelaySeconds must be 0..3600`);
  if (!inRange(resolved.expireInSeconds, 1, 86_400))
    throw new Error(`${def.name}: expireInSeconds must be 1..86400`);
  if (!inRange(resolved.concurrency, 1, 10))
    throw new Error(`${def.name}: concurrency must be 1..10`);
  if (resolved.cron !== undefined && !CRON_PATTERN.test(resolved.cron.trim()))
    throw new Error(`${def.name}: cron must have 5 fields`);
  return resolved;
}

/** Declares a job. Re-declaring the same name replaces it (dev hot reload) but must still be valid. */
export function defineJob<Data extends object>(def: JobDef<Data>): ResolvedJob {
  const resolved = resolveJob(def);
  jobs.set(resolved.name, resolved);
  return resolved;
}

export function listJobs(): ResolvedJob[] {
  return [...jobs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getJob(name: string): ResolvedJob | undefined {
  return jobs.get(name);
}

export function resetJobs(): void {
  jobs.clear();
}
