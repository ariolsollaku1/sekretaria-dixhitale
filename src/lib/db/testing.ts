import { db } from "./client";

/**
 * TRUNCATE every application table (not `_prisma_migrations`). Test-only: refuses to run unless the
 * connected database name ends in `_test`, so a misconfigured DATABASE_URL cannot wipe real data.
 */
export async function resetDatabase(): Promise<void> {
  const [{ name }] = await db.$queryRaw<{ name: string }[]>`select current_database() as name`;
  if (!name.endsWith("_test")) throw new Error(`resetDatabase refused: "${name}" is not a test DB`);

  const tables = await db.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
