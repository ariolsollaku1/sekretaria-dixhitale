import "server-only";
import { db } from "@/lib/db";

const toDay = (d: Date) => d.toISOString().slice(0, 10);

export type HoursSession = {
  id: string;
  assignmentId: string;
  staffId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  hours: number;
  topic: string | null;
  status: "PLANNED" | "HELD" | "CANCELLED";
  kind: "LECTURE" | "SEMINAR" | "LAB";
  semester: number;
  courseCode: string;
  courseName: string;
  groupLabel: string;
};

/**
 * HR-04: the class sessions of the given lecturers within the academic year (optionally one date
 * range), with what is needed to label a course line. Delivered hours are the HELD ones (Q-22).
 */
export async function sessionsForHours(opts: {
  /** Without it, sessions of every academic year. */
  yearId?: string;
  staffIds: readonly string[];
  from?: string;
  to?: string;
}): Promise<HoursSession[]> {
  if (opts.staffIds.length === 0) return [];
  const rows = await db.classSession.findMany({
    where: {
      assignment: {
        staffId: { in: [...opts.staffIds] },
        ...(opts.yearId ? { group: { academicYearId: opts.yearId } } : {}),
      },
      ...(opts.from || opts.to
        ? {
            date: {
              ...(opts.from ? { gte: new Date(`${opts.from}T00:00:00Z`) } : {}),
              ...(opts.to ? { lte: new Date(`${opts.to}T00:00:00Z`) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    select: {
      id: true,
      assignmentId: true,
      date: true,
      startMinute: true,
      endMinute: true,
      hours: true,
      topic: true,
      status: true,
      assignment: {
        select: {
          staffId: true,
          kind: true,
          semester: true,
          planCourse: { select: { course: { select: { code: true, name: true } } } },
          group: {
            select: {
              name: true,
              cohort: { select: { name: true, program: { select: { code: true } } } },
            },
          },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    assignmentId: r.assignmentId,
    staffId: r.assignment.staffId,
    date: toDay(r.date),
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    hours: r.hours,
    topic: r.topic,
    status: r.status,
    kind: r.assignment.kind,
    semester: r.assignment.semester,
    courseCode: r.assignment.planCourse.course.code,
    courseName: r.assignment.planCourse.course.name,
    groupLabel: `${r.assignment.group.cohort.program.code} · ${r.assignment.group.cohort.name} · ${r.assignment.group.name}`,
  }));
}
