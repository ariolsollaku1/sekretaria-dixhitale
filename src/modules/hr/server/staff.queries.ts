import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can, grantScopes } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";

export const toDay = (d: Date) => d.toISOString().slice(0, 10);

export type StaffView = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  gender: "FEMALE" | "MALE";
  /** null when the viewer may not see it (AC-9) */
  birthDate: string | null;
  nationalId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  kind: "ACADEMIC" | "ADMINISTRATIVE";
  category: "PAE" | "PAK" | "VOLUNTEER";
  degree: string | null;
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
  retired: boolean;
  primaryEmployer: string | null;
  contractStart: string;
  contractEnd: string | null;
  active: boolean;
};

const include = { person: true, department: { select: { name: true, facultyId: true } } } as const;
type Row = Prisma.StaffGetPayload<{ include: typeof include }>;

/** The unmasked view; callers mask it with `maskFor`. Used inside transactions (audit before/after). */
export function fullView(s: Row): StaffView {
  return {
    id: s.id,
    personId: s.personId,
    firstName: s.person.firstName,
    lastName: s.person.lastName,
    fatherName: s.person.fatherName,
    gender: s.person.gender,
    birthDate: toDay(s.person.birthDate),
    nationalId: s.person.nationalId,
    address: s.person.address,
    phone: s.person.phone,
    email: s.person.email,
    kind: s.kind,
    category: s.category,
    degree: s.degree,
    title: s.title,
    departmentId: s.departmentId,
    departmentName: s.department?.name ?? null,
    retired: s.retired,
    primaryEmployer: s.primaryEmployer,
    contractStart: toDay(s.contractStart),
    contractEnd: s.contractEnd ? toDay(s.contractEnd) : null,
    active: s.active,
  };
}

/** AC-9: personal identifiers only for holders of `hr.staff.sensitive`. */
export function maskFor(view: StaffView, sensitive: boolean): StaffView {
  return sensitive ? view : { ...view, birthDate: null, nationalId: null, address: null };
}

/** AC-8: institution-wide readers see everything; unit-scoped ones their departments / faculties. */
export async function scopeWhere(user: { id: string }): Promise<Prisma.StaffWhereInput> {
  const g = await grantScopes(user, "hr.staff.read");
  if (g.institution) return {};
  return {
    OR: [
      { departmentId: { in: g.departmentIds } },
      { department: { facultyId: { in: g.facultyIds } } },
    ],
  };
}

export async function getStaffRow(id: string, client: Pick<Tx, "staff"> = db) {
  return client.staff.findUnique({ where: { id }, include });
}

/** AC-11: null when the staff member does not exist or is outside the user's scope. */
export async function getStaff(user: { id: string }, id: string): Promise<StaffView | null> {
  const [row, sensitive] = await Promise.all([
    db.staff.findFirst({ where: { AND: [{ id }, await scopeWhere(user)] }, include }),
    can(user, "hr.staff.sensitive"),
  ]);
  return row ? maskFor(fullView(row), sensitive) : null;
}

/** AC-10: the record of the signed-in user's own person, nothing else. */
export async function getOwnStaff(user: { id: string }): Promise<StaffView | null> {
  const u = await db.user.findUnique({ where: { id: user.id }, select: { personId: true } });
  if (!u?.personId) return null;
  const row = await db.staff.findUnique({ where: { personId: u.personId }, include });
  // a person always sees their own identifiers
  return row ? fullView(row) : null;
}

export async function listDepartmentOptions() {
  const rows = await db.department.findMany({
    where: { active: true, faculty: { active: true } },
    orderBy: [{ faculty: { code: "asc" } }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });
  return rows.map((d) => ({ id: d.id, label: `${d.code} — ${d.name}` }));
}
