import "server-only";
import { db, type Tx } from "@/lib/db";

/** Roles currently held by a user. */
export async function currentRoles(
  userId: string,
  client: Pick<Tx, "userRole"> = db,
): Promise<string[]> {
  const now = new Date();
  const rows = await client.userRole.findMany({
    where: { userId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
    select: { role: true },
  });
  return [...new Set(rows.map((r) => r.role))];
}

/** AC-7: the sysadmin handles every form; others those whose owner roles they hold. */
export const mayHandle = (roles: readonly string[], ownerRoles: readonly string[]): boolean =>
  roles.includes("sysadmin") || roles.some((r) => ownerRoles.includes(r));
