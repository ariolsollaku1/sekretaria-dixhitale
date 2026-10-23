import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can, grantScopes } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";

export const toDay = (d: Date) => d.toISOString().slice(0, 10);

export type StudentView = {
  id: string;
  personId: string;
  studentNumber: string;
  nim: string | null;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  gender: "FEMALE" | "MALE";
  /** null when the viewer may not see it (AC-10) */
  birthDate: string | null;
  nationalId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  birthPlace: string | null;
  residence: string | null;
};

const studentInclude = { person: true } satisfies Prisma.StudentInclude;
type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

export function fullView(s: StudentRow): StudentView {
  return {
    id: s.id,
    personId: s.personId,
    studentNumber: s.studentNumber,
    nim: s.nim,
    firstName: s.person.firstName,
    lastName: s.person.lastName,
    fatherName: s.person.fatherName,
    gender: s.person.gender,
    birthDate: toDay(s.person.birthDate),
    nationalId: s.person.nationalId,
    address: s.person.address,
    phone: s.person.phone,
    email: s.person.email,
    birthPlace: s.person.birthPlace,
    residence: s.person.residence,
  };
}

/** AC-10: identifiers only for holders of `stu.student.sensitive`. */
export function maskFor(view: StudentView, sensitive: boolean): StudentView {
  return sensitive ? view : { ...view, birthDate: null, nationalId: null, address: null };
}

/** AC-9: institution-wide readers see all; scoped ones the students enrolled in their programs. */
export async function scopeWhere(user: { id: string }): Promise<Prisma.StudentWhereInput> {
  const g = await grantScopes(user, "stu.student.read");
  if (g.institution) return {};
  return {
    enrollments: {
      some: {
        program: {
          OR: [
            { id: { in: g.programIds } },
            { departmentId: { in: g.departmentIds } },
            { department: { facultyId: { in: g.facultyIds } } },
          ],
        },
      },
    },
  };
}

export async function getStudentRow(id: string, client: Pick<Tx, "student"> = db) {
  return client.student.findUnique({ where: { id }, include: studentInclude });
}

const enrollmentInclude = {
  program: { select: { id: true, code: true, name: true, durationYears: true, cycle: true } },
  cohort: { select: { id: true, name: true, startYear: { select: { code: true } } } },
  years: {
    orderBy: { academicYear: { startDate: "desc" as const } },
    include: {
      academicYear: { select: { id: true, code: true } },
      group: { select: { id: true, name: true } },
    },
  },
  history: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.EnrollmentInclude;

export type EnrollmentRecord = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

export async function listEnrollments(studentId: string): Promise<EnrollmentRecord[]> {
  return db.enrollment.findMany({
    where: { studentId },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    include: enrollmentInclude,
  });
}

/** AC-10: null when the student does not exist or is outside the user's scope. */
export async function getStudent(user: { id: string }, id: string) {
  const [row, sensitive] = await Promise.all([
    db.student.findFirst({
      where: { AND: [{ id }, await scopeWhere(user)] },
      include: studentInclude,
    }),
    can(user, "stu.student.sensitive"),
  ]);
  if (!row) return null;
  return { student: maskFor(fullView(row), sensitive), enrollments: await listEnrollments(row.id) };
}

/** AC-11: the signed-in student's own record (identifiers included — it is their own). */
export async function getOwnStudent(user: { id: string }) {
  const u = await db.user.findUnique({ where: { id: user.id }, select: { personId: true } });
  if (!u?.personId) return null;
  const row = await db.student.findUnique({
    where: { personId: u.personId },
    include: studentInclude,
  });
  return row ? { student: fullView(row), enrollments: await listEnrollments(row.id) } : null;
}

/** For the forms: active cohorts of active programs, and the groups of a cohort. */
export async function listCohortOptions() {
  const cohorts = await db.cohort.findMany({
    where: { active: true, program: { active: true } },
    orderBy: [{ program: { code: "asc" } }, { startYear: { startDate: "desc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      programId: true,
      program: { select: { code: true, name: true } },
    },
  });
  return cohorts.map((c) => ({
    id: c.id,
    programId: c.programId,
    program: `${c.program.code} — ${c.program.name}`,
    label: c.name,
  }));
}

export async function listGroupOptions(cohortId: string) {
  const groups = await db.studentGroup.findMany({
    where: { cohortId, active: true },
    orderBy: [{ academicYear: { startDate: "desc" } }, { yearOfStudy: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      yearOfStudy: true,
      academicYearId: true,
      academicYear: { select: { code: true } },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    academicYearId: g.academicYearId,
    yearOfStudy: g.yearOfStudy,
    label: `${g.academicYear.code} · ${g.name}`,
  }));
}
