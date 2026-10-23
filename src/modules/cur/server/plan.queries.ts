import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can, grantScopes } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";
import { resolveCreditsPerSemester } from "../domain/plan-rules";

export const toDay = (d: Date) => d.toISOString().slice(0, 10);

const planInclude = {
  program: {
    select: {
      id: true,
      code: true,
      name: true,
      active: true,
      durationYears: true,
      totalCredits: true,
      cycle: true,
    },
  },
  validFrom: { select: { id: true, code: true } },
  courses: {
    orderBy: [
      { yearOfStudy: "asc" as const },
      { semester: "asc" as const },
      { course: { code: "asc" as const } },
    ],
    include: {
      course: { select: { code: true, name: true, nameEn: true } },
      category: { select: { code: true, nameSq: true, nameEn: true } },
    },
  },
} satisfies Prisma.CurriculumPlanInclude;
export type PlanRecord = Prisma.CurriculumPlanGetPayload<{ include: typeof planInclude }>;

/**
 * AC-10/AC-11: which plans this user may see. `read` holders see every status inside their scope;
 * `view`-only users see approved plans (institution-wide); anyone else sees nothing.
 */
export async function planWhere(user: { id: string }): Promise<Prisma.CurriculumPlanWhereInput> {
  if (await can(user, "cur.plan.read")) {
    const g = await grantScopes(user, "cur.plan.read");
    if (g.institution) return {};
    return {
      program: {
        OR: [
          { id: { in: g.programIds } },
          { departmentId: { in: g.departmentIds } },
          { department: { facultyId: { in: g.facultyIds } } },
        ],
      },
    };
  }
  if (await can(user, "cur.plan.view")) return { status: { in: ["APPROVED"] } };
  return { id: { in: [] } };
}

export async function getPlanRow(id: string, client: Pick<Tx, "curriculumPlan"> = db) {
  return client.curriculumPlan.findUnique({ where: { id }, include: planInclude });
}

/** AC-10: null when the plan does not exist or the user may not see it. */
export async function getPlan(user: { id: string }, id: string): Promise<PlanRecord | null> {
  return db.curriculumPlan.findFirst({
    where: { AND: [{ id }, await planWhere(user)] },
    include: planInclude,
  });
}

export async function getCreditsPerSemester(client: Pick<Tx, "systemSetting"> = db) {
  const row = await client.systemSetting.findUnique({
    where: { key: "cur.plan.creditsPerSemester" },
  });
  return resolveCreditsPerSemester(row?.value);
}

/** Active catalog courses for the editor's picker (all staff with plan read may look at the catalog). */
export async function listCourseOptions() {
  const courses = await db.course.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return courses.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }));
}

/** Programs the user may write plans for (for the "new plan" form). */
export async function writablePrograms(user: { id: string }) {
  const g = await grantScopes(user, "cur.plan.write");
  const where: Prisma.StudyProgramWhereInput = g.institution
    ? { active: true }
    : {
        active: true,
        OR: [
          { id: { in: g.programIds } },
          { departmentId: { in: g.departmentIds } },
          { department: { facultyId: { in: g.facultyIds } } },
        ],
      };
  const programs = await db.studyProgram.findMany({
    where,
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return programs.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
}

/** Existing plans of a program, for "copy from". */
export async function listProgramPlans(programId: string) {
  const plans = await db.curriculumPlan.findMany({
    where: { programId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, validFrom: { select: { code: true } } },
  });
  return plans.map((p) => ({
    id: p.id,
    version: p.version,
    status: p.status,
    validFrom: p.validFrom.code,
  }));
}
