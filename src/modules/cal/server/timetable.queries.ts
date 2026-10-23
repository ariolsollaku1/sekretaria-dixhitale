import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { getOwnStaffId } from "@/modules/hr";
import { listStaffAssignments } from "@/modules/cur";
import { formatTime, type Slot } from "../domain/timetable-rules";

export const toDay = (d: Date) => d.toISOString().slice(0, 10);

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
          cohort: { select: { name: true, program: { select: { code: true } } } },
        },
      },
      planCourse: { select: { course: { select: { code: true, name: true } } } },
      staff: { select: { person: { select: { firstName: true, lastName: true } } } },
    },
  },
} satisfies Prisma.TimetableEntryInclude;
type Row = Prisma.TimetableEntryGetPayload<{ include: typeof include }>;

export type EntryView = Slot & {
  id: string;
  assignmentId: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  courseCode: string;
  courseName: string;
  groupLabel: string;
  lecturer: string;
  note: string | null;
};

export const view = (r: Row): EntryView => ({
  id: r.id,
  assignmentId: r.assignmentId,
  weekday: r.weekday,
  startMinute: r.startMinute,
  endMinute: r.endMinute,
  room: r.room,
  validFrom: toDay(r.validFrom),
  validTo: toDay(r.validTo),
  note: r.note,
  groupId: r.assignment.groupId,
  staffId: r.assignment.staffId,
  kind: r.assignment.kind,
  courseCode: r.assignment.planCourse.course.code,
  courseName: r.assignment.planCourse.course.name,
  groupLabel: `${r.assignment.group.cohort.program.code} · ${r.assignment.group.cohort.name} · ${r.assignment.group.name}`,
  lecturer: `${r.assignment.staff.person.lastName} ${r.assignment.staff.person.firstName}`,
  label: `${r.assignment.planCourse.course.code} ${formatTime(r.startMinute)}–${formatTime(r.endMinute)}`,
});

export async function listEntries(
  where: Prisma.TimetableEntryWhereInput,
  client: Pick<Tx, "timetableEntry"> = db,
) {
  const rows = await client.timetableEntry.findMany({
    where,
    include,
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });
  return rows.map(view);
}

/** The entries that can clash with a slot: same weekday, and the same group, lecturer or room. */
export async function candidatesFor(
  client: Pick<Tx, "timetableEntry">,
  s: { weekday: number; groupId: string; staffId: string; room: string | null },
): Promise<Slot[]> {
  return listEntries(
    {
      weekday: s.weekday,
      OR: [
        { assignment: { groupId: s.groupId } },
        { assignment: { staffId: s.staffId } },
        ...(s.room ? [{ room: { equals: s.room, mode: "insensitive" as const } }] : []),
      ],
    },
    client,
  );
}

export const groupEntries = (groupId: string) => listEntries({ assignment: { groupId } });
export const roomEntries = (room: string) =>
  listEntries({ room: { equals: room.trim(), mode: "insensitive" } });

/** AC-5: a lecturer's timetable for the year (their assignments). Null when the user has no staff record. */
export async function staffEntries(userId: string, yearId: string) {
  const staffId = await getOwnStaffId(userId);
  if (!staffId) return null;
  return listEntries({ assignment: { staffId, group: { academicYearId: yearId } } });
}

/** AC-5: a student's timetable: the groups of their open enrollments' yearly registrations in the year. */
export async function studentEntries(userId: string, yearId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!u?.personId) return null;
  const regs = await db.yearRegistration.findMany({
    where: {
      academicYearId: yearId,
      enrollment: { student: { personId: u.personId }, status: "ACTIVE" },
    },
    select: { groupId: true },
  });
  if (regs.length === 0) return [];
  return listEntries({ assignment: { groupId: { in: regs.map((r) => r.groupId) } } });
}

export { listStaffAssignments };
