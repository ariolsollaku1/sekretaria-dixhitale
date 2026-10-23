// AC-3: tables never exported. Secrets and tokens, operational noise, and the run log itself.
export const EXCLUDED_TABLES: ReadonlySet<string> = new Set([
  "_prisma_migrations",
  "sessions",
  "accounts",
  "verifications",
  "calendar_feed_tokens",
  "rate_limit_hits",
  "backup_runs",
]);

/** The tables to export, sorted; the job-system schema is not in `public` and so never listed. */
export function exportableTables(all: readonly string[]): string[] {
  return all.filter((t) => !EXCLUDED_TABLES.has(t)).sort();
}
