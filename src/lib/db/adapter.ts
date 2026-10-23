import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma's pg adapter sends dates as UTC strings without an offset, which Postgres reads in the
 * *session* time zone. Force UTC so every instant is stored correctly (conventions: timestamps are
 * UTC, displayed in Europe/Tirane). Shared by the app, the seed runner and tests.
 */
export function createAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString, options: "-c timezone=UTC" });
}
