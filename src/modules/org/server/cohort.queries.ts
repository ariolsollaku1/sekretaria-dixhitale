import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { grantScopes } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";
import { toDay } from "./year.queries";

/** AC-11: program scope of a reader (institution = all; else programs of the assignments). */
export async function programScope(
  user: { id: string },
  permission: "org.cohort.read" | "org.group.read" | "org.cohort.write",
): Promise<Prisma.StudyProgramWhereInput> {
  const g = await grantScopes(user, permission);
  if (g.institution) return {};
  return {
    OR: [
      { id: { in: g.programIds } },
      { departmentId: { in: g.departmentIds } },
      { department: { facultyId: { in: g.facultyIds } } },
    ],
  };
}

export const cohortInclude = {
  program: { select: { id: true, code: true, name: true, active: true, durationYears: true } },
  startYear: { select: { id: true, code: true, startDate: true } },
  plan: { select: { id: true, version: true, status: true } },
} satisfies Prisma.CohortInclude;
export type CohortRecord = Prisma.CohortGetPayload<{ include: typeof cohortInclude }>;

export async function getCohortRow(id: string, client: Pick<Tx, "cohort"> = db) {
  return client.cohort.findUnique({ where: { id }, include: cohortInclude });
}

/** AC-11: null when the cohort does not exist or is outside the reader's program scope. */
export async function getCohort(user: { id: string }, id: string) {
  return db.cohort.findFirst({
    where: { id, program: await programScope(user, "org.cohort.read") },
    include: cohortInclude,
  });
}

export async function listCohortGroups(cohortId: string) {
  const groups = await db.studentGroup.findMany({
    where: { cohortId },
    orderBy: [{ academicYear: { startDate: "desc" } }, { yearOfStudy: "asc" }, { name: "asc" }],
    include: { academicYear: { select: { id: true, code: true } } },
  });
  return groups.map((g) => ({
    id: g.id,
    academicYearId: g.academicYearId,
    academicYear: g.academicYear.code,
    yearOfStudy: g.yearOfStudy,
    name: g.name,
    capacity: g.capacity,
    active: g.active,
  }));
}

/** Years with their start day, for the expected-year computation. */
export async function listYearRefs(client: Pick<Tx, "academicYear"> = db) {
  const years = await client.academicYear.findMany({ select: { id: true, startDate: true } });
  return years.map((y) => ({ id: y.id, startDate: toDay(y.startDate) }));
}

/** Programs a writer may create cohorts for: all active ones (cohort writers are institution-wide offices). */
export async function listProgramOptionsForCohorts() {
  const programs = await db.studyProgram.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return programs.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
}

export async function getDefaultGroupName(client: Pick<Tx, "systemSetting"> = db) {
  const { resolveDefaultGroupName } = await import("../domain/cohort-rules");
  const row = await client.systemSetting.findUnique({ where: { key: "org.defaultGroupName" } });
  return resolveDefaultGroupName(row?.value);
}
