import "server-only";
import { db } from "@/lib/db";
import { bellData, type NotificationView } from "@/lib/notify/queries";
import { listEvents, studentEntries, type EntryView, type EventView } from "@/modules/cal";
import { feed, type AnnouncementView } from "@/modules/ntf";
import {
  classesOn,
  coursesByYear,
  isOpen,
  today,
  totalCredits,
  upcoming,
} from "../domain/home-rules";

export const HOME_EVENTS = 5;
export const HOME_ANNOUNCEMENTS = 3;
export const HOME_NOTIFICATIONS = 5;

export type PlanCourseView = {
  id: string;
  code: string;
  name: string;
  semester: number;
  credits: number;
  isElective: boolean;
};

/** AC-3: why a course list is missing, or the list itself. */
export type CoursesView =
  | { state: "ok"; semesters: { semester: number; courses: PlanCourseView[] }[]; credits: number }
  | { state: "noRegistration" | "planDraft" | "notActive" };

export type HomeEnrollment = {
  id: string;
  status: "ACTIVE" | "SUSPENDED" | "DEREGISTERED" | "GRADUATED";
  programCode: string;
  programName: string;
  cycle: "FIRST" | "SECOND";
  cohortName: string;
  startedAt: string;
  yearOfStudy: number | null;
  groupName: string | null;
  courses: CoursesView;
};

export type PortalHome = {
  studentNumber: string;
  firstName: string;
  lastName: string;
  day: string;
  yearCode: string | null;
  open: HomeEnrollment[];
  closedCount: number;
  classes: EntryView[];
  events: EventView[];
  announcements: AnnouncementView[];
  notifications: { unread: number; latest: NotificationView[] };
};

const toDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * STU-03: everything the student's home page shows, keyed on the signed-in user's own person only
 * (AC-8). Null when the user has no student record.
 */
export async function getPortalHome(
  user: { id: string },
  now = new Date(),
): Promise<PortalHome | null> {
  const u = await db.user.findUnique({ where: { id: user.id }, select: { personId: true } });
  if (!u?.personId) return null;
  const student = await db.student.findUnique({
    where: { personId: u.personId },
    select: {
      id: true,
      studentNumber: true,
      person: { select: { firstName: true, lastName: true } },
    },
  });
  if (!student) return null;

  const year = await db.academicYear.findFirst({
    where: { status: "CURRENT" },
    orderBy: { startDate: "desc" },
    select: { id: true, code: true },
  });
  const rows = await db.enrollment.findMany({
    where: { studentId: student.id },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    include: {
      program: { select: { code: true, name: true, cycle: true } },
      cohort: { select: { name: true, plan: { select: { id: true, status: true } } } },
      years: {
        where: year ? { academicYearId: year.id } : { id: "none" },
        include: { group: { select: { name: true } } },
      },
    },
  });

  const open: HomeEnrollment[] = [];
  for (const e of rows.filter((r) => isOpen(r.status))) {
    const reg = e.years[0] ?? null;
    let courses: CoursesView;
    if (e.status !== "ACTIVE") courses = { state: "notActive" };
    else if (!reg) courses = { state: "noRegistration" };
    else if (e.cohort.plan.status === "DRAFT") courses = { state: "planDraft" };
    else {
      const planCourses = await db.planCourse.findMany({
        where: { planId: e.cohort.plan.id, yearOfStudy: reg.yearOfStudy },
        include: { course: { select: { code: true, name: true } } },
      });
      const semesters = coursesByYear(planCourses, reg.yearOfStudy).map((g) => ({
        semester: g.semester,
        courses: g.courses.map((c) => ({
          id: c.id,
          code: c.course.code,
          name: c.course.name,
          semester: c.semester,
          credits: c.credits,
          isElective: c.isElective,
        })),
      }));
      courses = {
        state: "ok",
        semesters,
        credits: totalCredits(semesters.flatMap((g) => g.courses)),
      };
    }
    open.push({
      id: e.id,
      status: e.status,
      programCode: e.program.code,
      programName: e.program.name,
      cycle: e.program.cycle,
      cohortName: e.cohort.name,
      startedAt: toDay(e.startedAt),
      yearOfStudy: reg?.yearOfStudy ?? null,
      groupName: reg?.group.name ?? null,
      courses,
    });
  }

  const hasActive = open.some((e) => e.status === "ACTIVE");
  const t = today(now);
  const [entries, events, announcements, notifications] = await Promise.all([
    year && hasActive ? studentEntries(user.id, year.id) : Promise.resolve(null),
    year && hasActive
      ? listEvents({ yearId: year.id, viewerId: user.id, includeCancelled: false })
      : Promise.resolve([] as EventView[]),
    feed(user.id, 1, now),
    bellData(user.id),
  ]);

  return {
    studentNumber: student.studentNumber,
    firstName: student.person.firstName,
    lastName: student.person.lastName,
    day: t.day,
    yearCode: year?.code ?? null,
    open,
    closedCount: rows.length - open.length,
    classes: classesOn(entries ?? [], t.day, t.weekday),
    events: upcoming(events, t.day, HOME_EVENTS),
    announcements: announcements.rows.slice(0, HOME_ANNOUNCEMENTS),
    notifications: {
      unread: notifications.unread,
      latest: notifications.latest.slice(0, HOME_NOTIFICATIONS),
    },
  };
}
