import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { can } from "@/lib/authz/guard";
import { getOwnStaffId } from "@/modules/hr";
import { getGroupContext } from "@/modules/org";
import { bySchedule, type Sitting } from "../domain/exam-rules";
import { formatTime } from "../domain/timetable-rules";

export const toDay = (d: Date) => d.toISOString().slice(0, 10);

export type SessionType = "WINTER" | "SUMMER" | "AUTUMN" | "MINI";

export type SessionView = {
  id: string;
  academicYearId: string;
  type: SessionType;
  startDate: string;
  endDate: string;
  published: boolean;
  sittingCount: number;
};

export async function listSessions(
  yearId: string,
  client: Pick<Tx, "examSession"> = db,
): Promise<SessionView[]> {
  const rows = await client.examSession.findMany({
    where: { academicYearId: yearId },
    include: { _count: { select: { sittings: true } } },
    orderBy: [{ startDate: "asc" }, { type: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id,
    academicYearId: s.academicYearId,
    type: s.type,
    startDate: toDay(s.startDate),
    endDate: toDay(s.endDate),
    published: s.publishedAt !== null,
    sittingCount: s._count.sittings,
  }));
}

export async function getSession(
  id: string,
  client: Pick<Tx, "examSession"> = db,
): Promise<SessionView | null> {
  const s = await client.examSession.findUnique({
    where: { id },
    include: { _count: { select: { sittings: true } } },
  });
  return s
    ? {
        id: s.id,
        academicYearId: s.academicYearId,
        type: s.type,
        startDate: toDay(s.startDate),
        endDate: toDay(s.endDate),
        published: s.publishedAt !== null,
        sittingCount: s._count.sittings,
      }
    : null;
}

const include = {
  session: { select: { type: true, academicYearId: true, publishedAt: true } },
  planCourse: {
    select: {
      planId: true,
      yearOfStudy: true,
      course: { select: { code: true, name: true } },
      plan: { select: { program: { select: { code: true } } } },
    },
  },
  examiners: {
    select: {
      staffId: true,
      staff: { select: { person: { select: { firstName: true, lastName: true } } } },
    },
  },
} satisfies Prisma.ExamSittingInclude;
type Row = Prisma.ExamSittingGetPayload<{ include: typeof include }>;

export type SittingView = Sitting & {
  id: string;
  sessionId: string;
  sessionType: SessionType;
  academicYearId: string;
  published: boolean;
  planCourseId: string;
  courseCode: string;
  courseName: string;
  programCode: string;
  note: string | null;
  examiners: { id: string; name: string }[];
};

export const sittingView = (r: Row): SittingView => ({
  id: r.id,
  sessionId: r.sessionId,
  sessionType: r.session.type,
  academicYearId: r.session.academicYearId,
  published: r.session.publishedAt !== null,
  planCourseId: r.planCourseId,
  date: toDay(r.date),
  startMinute: r.startMinute,
  endMinute: r.endMinute,
  room: r.room,
  note: r.note,
  planId: r.planCourse.planId,
  yearOfStudy: r.planCourse.yearOfStudy,
  courseCode: r.planCourse.course.code,
  courseName: r.planCourse.course.name,
  programCode: r.planCourse.plan.program.code,
  examinerIds: r.examiners.map((x) => x.staffId),
  examiners: r.examiners
    .map((x) => ({
      id: x.staffId,
      name: `${x.staff.person.lastName} ${x.staff.person.firstName}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  label: `${r.planCourse.course.code} ${formatTime(r.startMinute)}–${formatTime(r.endMinute)}`,
});

export async function listSittings(
  where: Prisma.ExamSittingWhereInput,
  client: Pick<Tx, "examSitting"> = db,
): Promise<SittingView[]> {
  const rows = await client.examSitting.findMany({ where, include });
  return rows.map(sittingView).sort(bySchedule);
}

/** AC-5: the sittings of the academic year on a date, to check a new one against. */
export const sittingsOnDay = (
  client: Pick<Tx, "examSitting">,
  yearId: string,
  date: string,
): Promise<SittingView[]> =>
  listSittings(
    { date: new Date(`${date}T00:00:00Z`), session: { academicYearId: yearId } },
    client,
  );

export const sessionSittings = (sessionId: string) => listSittings({ sessionId });

// ---- visibility (AC-7, AC-8, AC-9) -------------------------------------------------------------

/** Published sittings for the plan and year of study of the student's groups (`yearFilter` picks the years). */
async function studentWhere(
  userId: string,
  yearFilter: Prisma.YearRegistrationWhereInput["academicYear"],
): Promise<Prisma.ExamSittingWhereInput[]> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!u?.personId) return [];
  const regs = await db.yearRegistration.findMany({
    where: {
      academicYear: yearFilter,
      enrollment: { student: { personId: u.personId }, status: "ACTIVE" },
    },
    select: { groupId: true, academicYearId: true },
  });
  const out: Prisma.ExamSittingWhereInput[] = [];
  for (const r of regs) {
    const g = await getGroupContext(r.groupId);
    if (!g) continue;
    out.push({
      session: { academicYearId: r.academicYearId },
      planCourse: { planId: g.cohortPlanId, yearOfStudy: g.yearOfStudy },
    });
  }
  return out;
}

async function examinerWhere(userId: string): Promise<Prisma.ExamSittingWhereInput[]> {
  const staffId = await getOwnStaffId(userId);
  return staffId ? [{ examiners: { some: { staffId } } }] : [];
}

/** AC-8: "my exams" in a year — a student's (their groups) and a lecturer's (as examiner), published only. */
export async function myExams(userId: string, yearId: string): Promise<SittingView[]> {
  const any = [
    ...(await studentWhere(userId, { id: yearId })),
    ...(await examinerWhere(userId)).map((w) => ({ ...w, session: { academicYearId: yearId } })),
  ];
  if (any.length === 0) return [];
  return listSittings({ session: { publishedAt: { not: null } }, AND: [{ OR: any }] });
}

/** AC-9: what a user's calendar feed lists: all published sittings for staff readers, otherwise their own. */
export async function feedExams(userId: string): Promise<SittingView[]> {
  const years = { status: { in: ["CURRENT", "PLANNED"] as ("CURRENT" | "PLANNED")[] } };
  const published = { publishedAt: { not: null } };
  if (await can({ id: userId }, "cal.exam.read"))
    return listSittings({ session: { ...published, academicYear: years } });
  const any = [...(await studentWhere(userId, years)), ...(await examinerWhere(userId))];
  if (any.length === 0) return [];
  return listSittings({
    session: { ...published, academicYear: years },
    AND: [{ OR: any }],
  });
}
