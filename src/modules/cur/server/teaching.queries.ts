import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { grantScopes } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { getOwnStaffId, getStaffBriefs } from "@/modules/hr";
import {
  lecturerLoads,
  overloaded,
  resolveMaxPlannedHours,
  unassignedCourses,
} from "../domain/teaching-rules";

/** AC-7/AC-9: the programs a reader may see (institution = all). */
export async function teachingProgramScope(
  user: { id: string },
  permission: "cur.teaching.read" | "cur.teaching.write",
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

export async function getMaxPlannedHours(): Promise<number | null> {
  const row = await db.systemSetting.findUnique({ where: { key: "cur.teaching.maxPlannedHours" } });
  return resolveMaxPlannedHours(row?.value);
}

export type BoardAssignment = {
  id: string;
  planCourseId: string;
  staffId: string;
  staffName: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  plannedHours: number;
};
export type BoardCourse = {
  planCourseId: string;
  code: string;
  name: string;
  semester: number;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
  assignments: BoardAssignment[];
};
export type BoardGroup = {
  id: string;
  name: string;
  programCode: string;
  cohort: string;
  yearOfStudy: number;
  courses: BoardCourse[];
};

/**
 * AC-6: every active group of the year within the reader's programs, with the courses of its plan
 * for its year of study and their assignments; plus the unassigned pairs and overloaded lecturers.
 */
export async function board(
  user: { id: string },
  opts: { yearId: string; programCode?: string; semester?: 1 | 2 },
) {
  const groups = await db.studentGroup.findMany({
    where: {
      academicYearId: opts.yearId,
      active: true,
      cohort: {
        program: {
          AND: [
            await teachingProgramScope(user, "cur.teaching.read"),
            opts.programCode ? { code: opts.programCode } : {},
          ],
        },
      },
    },
    orderBy: [{ cohort: { program: { code: "asc" } } }, { yearOfStudy: "asc" }, { name: "asc" }],
    include: {
      cohort: {
        select: { name: true, curriculumPlanId: true, program: { select: { code: true } } },
      },
    },
  });
  const planIds = [...new Set(groups.map((g) => g.cohort.curriculumPlanId))];
  const planCourses = await db.planCourse.findMany({
    where: { planId: { in: planIds }, ...(opts.semester ? { semester: opts.semester } : {}) },
    orderBy: [{ semester: "asc" }, { course: { code: "asc" } }],
    include: { course: { select: { code: true, name: true } } },
  });
  const assignments = await db.teachingAssignment.findMany({
    where: { groupId: { in: groups.map((g) => g.id) } },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
  const staff = await getStaffBriefs([...new Set(assignments.map((a) => a.staffId))]);

  const out: BoardGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    programCode: g.cohort.program.code,
    cohort: g.cohort.name,
    yearOfStudy: g.yearOfStudy,
    courses: planCourses
      .filter((pc) => pc.planId === g.cohort.curriculumPlanId && pc.yearOfStudy === g.yearOfStudy)
      .map((pc) => ({
        planCourseId: pc.id,
        code: pc.course.code,
        name: pc.course.name,
        semester: pc.semester,
        hoursLecture: pc.hoursLecture,
        hoursSeminar: pc.hoursSeminar,
        hoursLab: pc.hoursLab,
        assignments: assignments
          .filter((a) => a.groupId === g.id && a.planCourseId === pc.id)
          .map((a) => ({
            id: a.id,
            planCourseId: a.planCourseId,
            staffId: a.staffId,
            staffName: staff.get(a.staffId)?.name ?? "—",
            kind: a.kind,
            plannedHours: a.plannedHours,
          })),
      })),
  }));

  const unassigned = unassignedCourses(
    out.flatMap((g) => g.courses.map((c) => ({ groupId: g.id, planCourseId: c.planCourseId }))),
    assignments,
  );
  const max = await getMaxPlannedHours();
  const loads = lecturerLoads(
    (
      await db.teachingAssignment.findMany({
        where: { group: { academicYearId: opts.yearId } },
        select: { staffId: true, plannedHours: true },
      })
    ).filter(() => true),
  );
  const heavy = overloaded(loads, max);
  const heavyStaff = await getStaffBriefs(heavy.map((h) => h.staffId));
  return {
    groups: out,
    unassigned: unassigned.map((u) => {
      const g = out.find((x) => x.id === u.groupId)!;
      const c = g.courses.find((x) => x.planCourseId === u.planCourseId)!;
      return {
        groupId: g.id,
        group: `${g.programCode} · ${g.cohort} · ${g.name}`,
        course: `${c.code} — ${c.name}`,
        planCourseId: u.planCourseId,
      };
    }),
    overloaded: heavy.map((h) => ({ ...h, name: heavyStaff.get(h.staffId)?.name ?? "—" })),
    maxPlannedHours: max,
  };
}

/** AC-8: the signed-in user's own assignments for a year. */
export async function ownAssignments(user: { id: string }, yearId: string) {
  const staffId = await getOwnStaffId(user.id);
  if (!staffId) return null;
  const rows = await db.teachingAssignment.findMany({
    where: { staffId, group: { academicYearId: yearId } },
    orderBy: [{ semester: "asc" }, { planCourse: { course: { code: "asc" } } }, { kind: "asc" }],
    include: {
      group: {
        select: {
          name: true,
          yearOfStudy: true,
          cohort: { select: { name: true, program: { select: { code: true } } } },
        },
      },
      planCourse: { select: { course: { select: { code: true, name: true } } } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    semester: a.semester,
    kind: a.kind,
    plannedHours: a.plannedHours,
    course: `${a.planCourse.course.code} — ${a.planCourse.course.name}`,
    group: `${a.group.cohort.program.code} · ${a.group.cohort.name} · ${a.group.name}`,
    yearOfStudy: a.group.yearOfStudy,
  }));
}
