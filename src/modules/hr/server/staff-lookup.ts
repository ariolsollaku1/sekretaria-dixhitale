import "server-only";
import { db, type Tx } from "@/lib/db";

/** For other modules (CUR-04 teaching assignments): active academic staff to choose from. */
export async function listLecturerOptions() {
  const staff = await db.staff.findMany({
    where: { active: true, kind: "ACADEMIC" },
    orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
    select: { id: true, category: true, person: { select: { firstName: true, lastName: true } } },
  });
  return staff.map((s) => ({
    id: s.id,
    label: `${s.person.lastName} ${s.person.firstName}`,
    category: s.category,
  }));
}

export type StaffBrief = {
  id: string;
  name: string;
  active: boolean;
  kind: "ACADEMIC" | "ADMINISTRATIVE";
  category: "PAE" | "PAK" | "VOLUNTEER";
};

export async function getStaffBriefs(
  ids: readonly string[],
  client: Pick<Tx, "staff"> = db,
): Promise<Map<string, StaffBrief>> {
  const rows = await client.staff.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      active: true,
      kind: true,
      category: true,
      person: { select: { firstName: true, lastName: true } },
    },
  });
  return new Map(
    rows.map((s) => [
      s.id,
      {
        id: s.id,
        name: `${s.person.lastName} ${s.person.firstName}`,
        active: s.active,
        kind: s.kind,
        category: s.category,
      },
    ]),
  );
}

/** The staff record of the signed-in user's own person, if any. */
export async function getOwnStaffId(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!u?.personId) return null;
  const staff = await db.staff.findUnique({
    where: { personId: u.personId },
    select: { id: true },
  });
  return staff?.id ?? null;
}
