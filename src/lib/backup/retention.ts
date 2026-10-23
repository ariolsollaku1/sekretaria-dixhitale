export type RetainedRun = { id: string; startedAt: Date };

/** AC-6: the runs to purge — everything but the newest `keep`. */
export function selectPurge<T extends RetainedRun>(runs: readonly T[], keep: number): T[] {
  return [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(keep);
}

/** AC-8: has the latest success become too old (or never happened)? */
export function isStale(lastSuccess: Date | null, maxHours: number, now: Date = new Date()) {
  return lastSuccess === null || now.getTime() - lastSuccess.getTime() > maxHours * 3_600_000;
}
