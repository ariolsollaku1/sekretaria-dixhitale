import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { grantScopes } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import {
  aggregate,
  isBelow,
  resolveThreshold,
  summarize,
  type Figures,
  type MarkFact,
} from "../domain/report-rules";

export async function getThreshold(): Promise<number> {
  const row = await db.systemSetting.findUnique({ where: { key: "att.thresholdPercent" } });
  return resolveThreshold(row?.value);
}

/**
 * AC-5 (Q-94): the assignments whose program lies in the reader's scope, for `att.attendance.read`
 * united with `att.attendance.correct`. An empty scope matches nothing.
 */
export async function scopedAssignmentWhere(user: {
  id: string;
}): Promise<Prisma.TeachingAssignmentWhereInput> {
  const [read, correct] = await Promise.all([
    grantScopes(user, "att.attendance.read"),
    grantScopes(user, "att.attendance.correct"),
  ]);
  if (read.institution || correct.institution) return {};
  const programIds = [...read.programIds, ...correct.programIds];
  const departmentIds = [...read.departmentIds, ...correct.departmentIds];
  const facultyIds = [...read.facultyIds, ...correct.facultyIds];
  const program = {
    OR: [
      { id: { in: programIds } },
      { departmentId: { in: departmentIds } },
      { department: { facultyId: { in: facultyIds } } },
    ],
  };
  return { group: { cohort: { program } } };
}

export type ReportFilters = {
  yearId: string;
  program?: string;
  group?: string;
  course?: string;
  kind?: string;
  from?: string;
  to?: string;
  below?: boolean;
};

export type ReportRow = Figures & {
  key: string;
  studentId: string;
  assignmentId: string;
  studentNumber: string;
  name: string;
  program: string;
  group: string;
  courseCode: string;
  courseName: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  lecturer: string;
  below: boolean;
};

export type SummaryRow = {
  assignmentId: string;
  program: string;
  group: string;
  courseCode: string;
  courseName: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  lecturer: string;
  classes: number;
  heldHours: number;
  students: number;
  averagePercent: number | null;
  below: number;
};

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const KINDS = ["LECTURE", "SEMINAR", "LAB"];

/** Held marks of the year inside the user's scope and the filters (AC-1, AC-3, AC-5). */
async function loadFacts(user: { id: string }, f: ReportFilters): Promise<MarkFact[]> {
  const scope = await scopedAssignmentWhere(user);
  const assignment: Prisma.TeachingAssignmentWhereInput = {
    AND: [
      scope,
      { group: { academicYearId: f.yearId } },
      f.program
        ? { group: { cohort: { program: { code: { contains: f.program, mode: "insensitive" } } } } }
        : {},
      f.group ? { group: { name: { contains: f.group, mode: "insensitive" } } } : {},
      f.course
        ? {
            planCourse: {
              course: {
                OR: [
                  { code: { contains: f.course, mode: "insensitive" } },
                  { name: { contains: f.course, mode: "insensitive" } },
                ],
              },
            },
          }
        : {},
      f.kind && KINDS.includes(f.kind) ? { kind: f.kind as "LECTURE" } : {},
    ],
  };
  const rows = await db.attendanceMark.findMany({
    where: {
      session: {
        status: "HELD", // Q-92
        assignment,
        ...(f.from || f.to
          ? {
              date: {
                ...(f.from ? { gte: day(f.from) } : {}),
                ...(f.to ? { lte: day(f.to) } : {}),
              },
            }
          : {}),
      },
    },
    select: {
      studentId: true,
      status: true,
      sessionId: true,
      session: { select: { hours: true, assignmentId: true } },
    },
  });
  return rows.map((r) => ({
    studentId: r.studentId,
    assignmentId: r.session.assignmentId,
    sessionId: r.sessionId,
    hours: r.session.hours,
    status: r.status,
  }));
}

async function assignmentInfo(ids: string[]) {
  const rows = await db.teachingAssignment.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      kind: true,
      group: {
        select: { name: true, cohort: { select: { program: { select: { code: true } } } } },
      },
      planCourse: { select: { course: { select: { code: true, name: true } } } },
      staff: { select: { person: { select: { firstName: true, lastName: true } } } },
    },
  });
  return new Map(
    rows.map((a) => [
      a.id,
      {
        kind: a.kind,
        program: a.group.cohort.program.code,
        group: a.group.name,
        courseCode: a.planCourse.course.code,
        courseName: a.planCourse.course.name,
        lecturer: `${a.staff.person.lastName} ${a.staff.person.firstName}`,
      },
    ]),
  );
}

/** AC-1/AC-3: one row per student and assignment with held classes in scope. */
export async function attendanceRows(user: { id: string }, f: ReportFilters): Promise<ReportRow[]> {
  const [facts, threshold] = await Promise.all([loadFacts(user, f), getThreshold()]);
  const { students } = aggregate(facts, threshold);
  if (students.length === 0) return [];
  const [info, people] = await Promise.all([
    assignmentInfo([...new Set(students.map((s) => s.assignmentId))]),
    db.student.findMany({
      where: { id: { in: [...new Set(students.map((s) => s.studentId))] } },
      select: {
        id: true,
        studentNumber: true,
        person: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);
  const byStudent = new Map(people.map((p) => [p.id, p]));
  const rows = students.flatMap((s) => {
    const a = info.get(s.assignmentId);
    const p = byStudent.get(s.studentId);
    if (!a || !p) return [];
    return [
      {
        ...s,
        key: `${s.assignmentId}:${s.studentId}`,
        studentNumber: p.studentNumber,
        name: `${p.person.lastName} ${p.person.firstName}`,
        ...a,
        below: isBelow(s.percent, threshold),
      } satisfies ReportRow,
    ];
  });
  return f.below ? rows.filter((r) => r.below) : rows;
}

/** AC-4: one row per assignment with held classes in scope. */
export async function assignmentSummaries(
  user: { id: string },
  f: ReportFilters,
): Promise<SummaryRow[]> {
  const [facts, threshold] = await Promise.all([loadFacts(user, f), getThreshold()]);
  const { assignments } = aggregate(facts, threshold);
  if (assignments.length === 0) return [];
  const info = await assignmentInfo(assignments.map((a) => a.assignmentId));
  const rows = assignments.flatMap((a) => {
    const i = info.get(a.assignmentId);
    return i ? [{ ...a, ...i } satisfies SummaryRow] : [];
  });
  return f.below ? rows.filter((r) => r.below > 0) : rows;
}

export type OwnCourseSummary = Figures & {
  assignmentId: string;
  courseCode: string;
  courseName: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  below: boolean;
};

/** AC-6 (Q-93): the signed-in student's own figures per course and kind; null without a student record. */
export async function ownSummary(
  userId: string,
  yearId: string,
): Promise<{ threshold: number; courses: OwnCourseSummary[] } | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!u?.personId) return null;
  const student = await db.student.findUnique({
    where: { personId: u.personId },
    select: { id: true },
  });
  if (!student) return null;
  const [threshold, marks] = await Promise.all([
    getThreshold(),
    db.attendanceMark.findMany({
      where: {
        studentId: student.id,
        session: { status: "HELD", assignment: { group: { academicYearId: yearId } } },
      },
      select: {
        status: true,
        session: {
          select: {
            hours: true,
            assignment: {
              select: {
                id: true,
                kind: true,
                planCourse: { select: { course: { select: { code: true, name: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);
  const byAssignment = new Map<string, typeof marks>();
  for (const m of marks) {
    const list = byAssignment.get(m.session.assignment.id) ?? [];
    list.push(m);
    byAssignment.set(m.session.assignment.id, list);
  }
  const courses = [...byAssignment.entries()].map(([assignmentId, list]) => {
    const a = list[0]!.session.assignment;
    const figures = summarize(list.map((m) => ({ hours: m.session.hours, status: m.status })));
    return {
      assignmentId,
      courseCode: a.planCourse.course.code,
      courseName: a.planCourse.course.name,
      kind: a.kind,
      ...figures,
      below: isBelow(figures.percent, threshold),
    };
  });
  courses.sort((x, y) => x.courseCode.localeCompare(y.courseCode) || x.kind.localeCompare(y.kind));
  return { threshold, courses };
}
