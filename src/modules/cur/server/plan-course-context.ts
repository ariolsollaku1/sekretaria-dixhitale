import "server-only";
import { db, type Tx } from "@/lib/db";

export type PlanCourseContext = {
  id: string;
  planId: string;
  yearOfStudy: number;
  semester: number;
  courseCode: string;
  courseName: string;
  programId: string;
  programCode: string;
  /// Years the program lasts (the final year of study is this number).
  durationYears: number;
};

const include = {
  course: { select: { code: true, name: true } },
  plan: {
    select: { programId: true, program: { select: { code: true, durationYears: true } } },
  },
} as const;

type Row = Awaited<ReturnType<typeof load>>[number];
const load = (client: Pick<Tx, "planCourse">, where: object) =>
  client.planCourse.findMany({ where, include });

const view = (p: Row): PlanCourseContext => ({
  id: p.id,
  planId: p.planId,
  yearOfStudy: p.yearOfStudy,
  semester: p.semester,
  courseCode: p.course.code,
  courseName: p.course.name,
  programId: p.plan.programId,
  programCode: p.plan.program.code,
  durationYears: p.plan.program.durationYears,
});

/** For other modules (CAL-03 exam schedule): where a plan course sits and what it is. */
export async function getPlanCourseContext(
  id: string,
  client: Pick<Tx, "planCourse"> = db,
): Promise<PlanCourseContext | null> {
  const rows = await load(client, { id });
  return rows[0] ? view(rows[0]) : null;
}

/**
 * For the exam picker: the plan courses that students of the year actually follow, i.e. courses of
 * the plan of a cohort that has an active group of that year of study in the academic year.
 */
export async function listExamCourses(
  academicYearId: string,
  client: Pick<Tx, "planCourse" | "studentGroup"> = db,
): Promise<PlanCourseContext[]> {
  const groups = await client.studentGroup.findMany({
    where: { academicYearId, active: true },
    select: { yearOfStudy: true, cohort: { select: { curriculumPlanId: true } } },
  });
  const pairs = new Map<string, { planId: string; yearOfStudy: number }>();
  for (const g of groups) {
    const planId = g.cohort.curriculumPlanId;
    pairs.set(`${planId}:${g.yearOfStudy}`, { planId, yearOfStudy: g.yearOfStudy });
  }
  if (pairs.size === 0) return [];
  const rows = await load(client, { OR: [...pairs.values()] });
  return rows
    .map(view)
    .sort(
      (a, b) =>
        a.programCode.localeCompare(b.programCode) ||
        a.yearOfStudy - b.yearOfStudy ||
        a.semester - b.semester ||
        a.courseCode.localeCompare(b.courseCode),
    );
}
