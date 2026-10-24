import "server-only";
import { bellData, type NotificationView } from "@/lib/notify/queries";
import {
  isoWeekday,
  ownSessions,
  rosterOf,
  todayInTirane,
  type RosterStudent,
} from "@/modules/att";
import { staffEntries, type EntryView } from "@/modules/cal";
import { ownAssignments } from "@/modules/cur";
import { feed, type AnnouncementView } from "@/modules/ntf";
import { bySemester, classesOn, progressOf, type Progress } from "../domain/teaching-rules";

export const HUB_ANNOUNCEMENTS = 3;
export const HUB_NOTIFICATIONS = 5;

export type HubAssignment = {
  id: string;
  groupId: string;
  semester: number;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  plannedHours: number;
  course: string;
  group: string;
  students: number;
  progress: Progress;
};

export type TeachingHub = {
  day: string;
  semesters: { semester: number; rows: HubAssignment[] }[];
  assignmentCount: number;
  classes: EntryView[];
  announcements: AnnouncementView[];
  notifications: { unread: number; latest: NotificationView[] };
};

/**
 * HR-07: everything the lecturer's hub shows, keyed on the signed-in user's own staff record only
 * (AC-8). Null when the user has no staff record.
 */
export async function getTeachingHub(
  user: { id: string },
  yearId: string | null,
  now = new Date(),
): Promise<TeachingHub | null> {
  const assignments = yearId ? await ownAssignments(user, yearId) : [];
  if (assignments === null) return null;
  const day = todayInTirane(now);
  const [sessions, entries, announcements, notifications, rosters] = await Promise.all([
    yearId ? ownSessions(user.id, yearId) : Promise.resolve([]),
    yearId ? staffEntries(user.id, yearId) : Promise.resolve([]),
    feed(user.id, 1, now),
    bellData(user.id),
    Promise.all(
      assignments.map(async (a) => (yearId ? (await rosterOf(a.groupId, yearId)).length : 0)),
    ),
  ]);
  const rows: HubAssignment[] = assignments.map((a, i) => ({
    id: a.id,
    groupId: a.groupId,
    semester: a.semester,
    kind: a.kind,
    plannedHours: a.plannedHours,
    course: a.course,
    group: a.group,
    students: rosters[i] ?? 0,
    progress: progressOf(
      (sessions ?? []).filter((s) => s.assignmentId === a.id),
      day,
    ),
  }));
  return {
    day,
    semesters: bySemester(rows),
    assignmentCount: rows.length,
    classes: classesOn(entries ?? [], day, isoWeekday(day)),
    announcements: announcements.rows.slice(0, HUB_ANNOUNCEMENTS),
    notifications: {
      unread: notifications.unread,
      latest: notifications.latest.slice(0, HUB_NOTIFICATIONS),
    },
  };
}

export type AssignmentRoster = {
  id: string;
  course: string;
  group: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  semester: number;
  students: RosterStudent[];
};

/**
 * AC-6: the roster of one of the signed-in lecturer's own assignments of the year; null for any
 * other assignment (never revealing whether it exists).
 */
export async function getAssignmentRoster(
  user: { id: string },
  yearId: string,
  assignmentId: string,
): Promise<AssignmentRoster | null> {
  const own = await ownAssignments(user, yearId);
  const a = own?.find((x) => x.id === assignmentId);
  if (!a) return null;
  return {
    id: a.id,
    course: a.course,
    group: a.group,
    kind: a.kind,
    semester: a.semester,
    students: await rosterOf(a.groupId, yearId),
  };
}
