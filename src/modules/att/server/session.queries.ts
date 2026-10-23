import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";
import { getOwnStaffId } from "@/modules/hr";
import {
  countMarks,
  lecturerMayRecord,
  resolveWindowDays,
  todayInTirane,
  type Counts,
} from "../domain/session-rules";

export const toDay = (d: Date) => d.toISOString().slice(0, 10);

export async function getWindowDays(client: Pick<Tx, "systemSetting"> = db): Promise<number> {
  const row = await client.systemSetting.findUnique({ where: { key: "att.editWindowDays" } });
  return resolveWindowDays(row?.value);
}

const include = {
  assignment: {
    select: {
      id: true,
      groupId: true,
      staffId: true,
      kind: true,
      group: {
        select: {
          name: true,
          academicYearId: true,
          cohort: { select: { name: true, program: { select: { code: true } } } },
        },
      },
      planCourse: { select: { course: { select: { code: true, name: true } } } },
      staff: { select: { person: { select: { firstName: true, lastName: true } } } },
    },
  },
  marks: { select: { status: true } },
} satisfies Prisma.ClassSessionInclude;
type Row = Prisma.ClassSessionGetPayload<{ include: typeof include }>;

export type SessionView = {
  id: string;
  assignmentId: string;
  groupId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  hours: number;
  topic: string | null;
  status: "PLANNED" | "HELD" | "CANCELLED";
  kind: "LECTURE" | "SEMINAR" | "LAB";
  courseCode: string;
  courseName: string;
  groupLabel: string;
  lecturer: string;
  counts: Counts;
};

const view = (r: Row): SessionView => ({
  id: r.id,
  assignmentId: r.assignmentId,
  groupId: r.assignment.groupId,
  date: toDay(r.date),
  startMinute: r.startMinute,
  endMinute: r.endMinute,
  hours: r.hours,
  topic: r.topic,
  status: r.status,
  kind: r.assignment.kind,
  courseCode: r.assignment.planCourse.course.code,
  courseName: r.assignment.planCourse.course.name,
  groupLabel: `${r.assignment.group.cohort.program.code} · ${r.assignment.group.cohort.name} · ${r.assignment.group.name}`,
  lecturer: `${r.assignment.staff.person.lastName} ${r.assignment.staff.person.firstName}`,
  counts: countMarks(r.marks),
});

const LIMIT = 300;

async function list(where: Prisma.ClassSessionWhereInput) {
  const rows = await db.classSession.findMany({
    where,
    include,
    orderBy: [{ date: "desc" }, { startMinute: "asc" }],
    take: LIMIT,
  });
  return rows.map(view);
}

/** AC-9: the lecturer's own sessions of the academic year (null when the user has no staff record). */
export async function ownSessions(userId: string, yearId: string, assignmentId?: string) {
  const staffId = await getOwnStaffId(userId);
  if (!staffId) return null;
  return list({
    assignment: {
      staffId,
      group: { academicYearId: yearId },
      ...(assignmentId ? { id: assignmentId } : {}),
    },
  });
}

/** AC-9/AC-11: a group's sessions, only where the reader's scope covers the group; else null. */
export async function groupSessions(user: { id: string }, groupId: string, assignmentId?: string) {
  const target = { kind: "group", id: groupId } as const;
  const allowed =
    (await can(user, "att.attendance.read", target)) ||
    (await can(user, "att.attendance.correct", target));
  if (!allowed) return null;
  return list({ assignment: { groupId, ...(assignmentId ? { id: assignmentId } : {}) } });
}

export type RosterStudent = {
  studentId: string;
  studentNumber: string;
  name: string;
};

/** AC-4 (Q-62): active enrollments whose yearly registration of the year is in the group. */
export async function rosterOf(
  groupId: string,
  academicYearId: string,
  client: Pick<Tx, "yearRegistration"> = db,
): Promise<RosterStudent[]> {
  const rows = await client.yearRegistration.findMany({
    where: { groupId, academicYearId, enrollment: { status: "ACTIVE" } },
    select: {
      enrollment: {
        select: {
          student: {
            select: {
              id: true,
              studentNumber: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  return rows
    .map((r) => r.enrollment.student)
    .map((s) => ({
      studentId: s.id,
      studentNumber: s.studentNumber,
      name: `${s.person.lastName} ${s.person.firstName}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type Access = {
  /** the viewer may read the session at all */
  read: boolean;
  /** the viewer may save attendance now, and as whom */
  edit: "record" | "correct" | null;
  /** why a lecturer cannot save right now */
  blocked: "FUTURE" | "WINDOW_CLOSED" | "CANCELLED" | "YEAR_CLOSED" | null;
};

/** What the viewer may do with a session (the services re-check on every write). */
export async function accessFor(
  user: { id: string },
  session: {
    date: string;
    status: string;
    assignmentStaffId: string;
    groupId: string;
    yearStatus: string;
  },
): Promise<Access> {
  const target = { kind: "group", id: session.groupId } as const;
  const corrector = await can(user, "att.attendance.correct", target);
  const reader = corrector || (await can(user, "att.attendance.read", target));
  let owner = false;
  if (!corrector && (await can(user, "att.attendance.record"))) {
    owner = (await getOwnStaffId(user.id)) === session.assignmentStaffId;
  }
  if (!reader && !owner) return { read: false, edit: null, blocked: null };
  if (session.yearStatus === "CLOSED") return { read: true, edit: null, blocked: "YEAR_CLOSED" };
  if (session.status === "CANCELLED") return { read: true, edit: null, blocked: "CANCELLED" };
  if (corrector) return { read: true, edit: "correct", blocked: null };
  if (!owner) return { read: true, edit: null, blocked: null };
  const gate = lecturerMayRecord(session.date, todayInTirane(), await getWindowDays());
  return gate.ok
    ? { read: true, edit: "record", blocked: null }
    : { read: true, edit: null, blocked: gate.reason };
}

export type SessionDetail = SessionView & {
  yearStatus: "PLANNED" | "CURRENT" | "CLOSED";
  academicYearId: string;
  assignmentStaffId: string;
  roster: (RosterStudent & {
    status: "PRESENT" | "ABSENT" | "EXCUSED" | null;
    note: string | null;
  })[];
  access: Access;
};

/** AC-4: a session with its roster and saved marks, or null when the viewer may not see it. */
export async function getSessionDetail(
  user: { id: string },
  sessionId: string,
): Promise<SessionDetail | null> {
  const row = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      ...include,
      marks: { select: { status: true, studentId: true, note: true } },
      assignment: {
        select: {
          ...include.assignment.select,
          group: {
            select: {
              ...include.assignment.select.group.select,
              academicYear: { select: { status: true } },
            },
          },
        },
      },
    },
  });
  if (!row) return null;
  const base = view(row);
  const yearStatus = row.assignment.group.academicYear.status;
  const access = await accessFor(user, {
    date: base.date,
    status: base.status,
    assignmentStaffId: row.assignment.staffId,
    groupId: base.groupId,
    yearStatus,
  });
  if (!access.read) return null;
  const marks = new Map(row.marks.map((m) => [m.studentId, m]));
  const roster = await rosterOf(base.groupId, row.assignment.group.academicYearId);
  return {
    ...base,
    yearStatus,
    academicYearId: row.assignment.group.academicYearId,
    assignmentStaffId: row.assignment.staffId,
    roster: roster.map((s) => ({
      ...s,
      status: marks.get(s.studentId)?.status ?? null,
      note: marks.get(s.studentId)?.note ?? null,
    })),
    access,
  };
}

export type AbsenceView = {
  sessionId: string;
  date: string;
  courseCode: string;
  courseName: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  hours: number;
  status: "ABSENT" | "EXCUSED";
};

/** AC-10: the student's own absent/excused marks of held sessions in the year; null without a student record. */
export async function ownAbsences(userId: string, yearId: string): Promise<AbsenceView[] | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!u?.personId) return null;
  const student = await db.student.findUnique({
    where: { personId: u.personId },
    select: { id: true },
  });
  if (!student) return null;
  const rows = await db.attendanceMark.findMany({
    where: {
      studentId: student.id,
      status: { in: ["ABSENT", "EXCUSED"] },
      session: { status: "HELD", assignment: { group: { academicYearId: yearId } } },
    },
    select: {
      status: true,
      session: {
        select: {
          id: true,
          date: true,
          hours: true,
          assignment: {
            select: {
              kind: true,
              planCourse: { select: { course: { select: { code: true, name: true } } } },
            },
          },
        },
      },
    },
    orderBy: { session: { date: "desc" } },
  });
  return rows.map((r) => ({
    sessionId: r.session.id,
    date: toDay(r.session.date),
    courseCode: r.session.assignment.planCourse.course.code,
    courseName: r.session.assignment.planCourse.course.name,
    kind: r.session.assignment.kind,
    hours: r.session.hours,
    status: r.status as "ABSENT" | "EXCUSED",
  }));
}
