import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { listJobs } from "./registry";

export const JOB_STATES = [
  "created",
  "retry",
  "active",
  "completed",
  "cancelled",
  "failed",
] as const;
export type JobState = (typeof JOB_STATES)[number];

export type QueueRow = {
  name: string;
  cron: string | null;
  waiting: number;
  active: number;
  failed: number;
};

/**
 * AC-7: every declared queue with counts and its schedule. Counts come straight from the job table
 * (pg-boss's own queue statistics are refreshed by a maintenance cycle and lag behind).
 */
export async function queueOverview(): Promise<QueueRow[]> {
  const declared = listJobs();
  if (declared.length === 0) return [];
  const counts = await db.$queryRaw<{ name: string; state: JobState; n: bigint }[]>(Prisma.sql`
    SELECT name, state::text AS state, count(*) AS n
    FROM pgboss.job
    WHERE name IN (${Prisma.join(declared.map((j) => j.name))}) AND state::text IN ('created', 'retry', 'active', 'failed')
    GROUP BY name, state`);
  const n = (name: string, ...states: string[]) =>
    counts
      .filter((c) => c.name === name && states.includes(c.state))
      .reduce((sum, c) => sum + Number(c.n), 0);
  return declared.map((job) => ({
    name: job.name,
    cron: job.cron ?? null,
    waiting: n(job.name, "created", "retry"),
    active: n(job.name, "active"),
    failed: n(job.name, "failed"),
  }));
}

export type JobRow = {
  id: string;
  name: string;
  state: JobState;
  attempts: number;
  createdOn: Date;
  startedOn: Date | null;
  completedOn: Date | null;
};

type RawJob = {
  id: string;
  name: string;
  state: JobState;
  retry_count: number;
  created_on: Date;
  started_on: Date | null;
  completed_on: Date | null;
};

/** AC-7: the most recent jobs (newest first), optionally by state and queue. Declared queues only. */
export async function recentJobs(
  filters: { state?: string; queue?: string } = {},
  limit = 100,
): Promise<JobRow[]> {
  const declared = listJobs().map((j) => j.name);
  if (declared.length === 0) return [];
  const names = filters.queue && declared.includes(filters.queue) ? [filters.queue] : declared;
  const state = (JOB_STATES as readonly string[]).includes(filters.state ?? "")
    ? filters.state
    : null;
  const rows = await db.$queryRaw<RawJob[]>(Prisma.sql`
    SELECT id::text AS id, name, state::text AS state, retry_count, created_on, started_on, completed_on
    FROM pgboss.job
    WHERE name IN (${Prisma.join(names)})
      ${state ? Prisma.sql`AND state::text = ${state}` : Prisma.empty}
    ORDER BY created_on DESC
    LIMIT ${limit}`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    state: r.state,
    attempts: r.retry_count + 1,
    createdOn: r.created_on,
    startedOn: r.started_on,
    completedOn: r.completed_on,
  }));
}

/** The state of one job, or null (also for queues that are not declared). */
export async function jobState(queue: string, id: string): Promise<JobState | null> {
  if (!listJobs().some((j) => j.name === queue)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await db.$queryRaw<{ state: JobState }[]>(
    Prisma.sql`SELECT state::text AS state FROM pgboss.job WHERE name = ${queue} AND id = ${id}::uuid`,
  );
  return rows[0]?.state ?? null;
}
