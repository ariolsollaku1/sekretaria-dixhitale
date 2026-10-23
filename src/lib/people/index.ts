import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";

type Client = Pick<Tx, "person" | "user">;

/**
 * Persons that already use this national ID or e-mail (HR-01, STU-01 share `Person`). The result
 * says which of them already have a staff or a student record, so each module can decide between
 * "duplicate" and "attach".
 */
export async function personsUsing(
  db: Client,
  keys: { nationalId: string | null; email: string | null },
  exceptPersonId?: string,
) {
  const or: Prisma.PersonWhereInput[] = [];
  if (keys.nationalId) or.push({ nationalId: keys.nationalId });
  if (keys.email) or.push({ email: keys.email });
  if (or.length === 0) return [];
  return db.person.findMany({
    where: { OR: or, ...(exceptPersonId ? { id: { not: exceptPersonId } } : {}) },
    include: { staff: { select: { id: true } }, student: { select: { id: true } } },
  });
}

/** A login account with this e-mail and no person yet becomes the person's account (never moved otherwise). */
export async function linkAccountByEmail(db: Client, email: string | null, personId: string) {
  if (!email) return;
  await db.user.updateMany({
    where: { email: { equals: email, mode: "insensitive" }, personId: null },
    data: { personId },
  });
}
