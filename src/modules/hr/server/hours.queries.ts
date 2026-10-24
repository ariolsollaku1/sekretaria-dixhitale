import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can, grantScopes } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { sessionsForHours, todayInTirane, type HoursSession } from "@/modules/att";
import { getAssignmentContext } from "@/modules/cur";
import {
  aggregateHours,
  approvalState,
  isMonth,
  monthBounds,
  rollupByMonth,
  type ApprovalState,
  type HoursLine,
  type MonthTotals,
} from "../domain/hours-rules";

type UserRef = { id: string };
type Category = "PAE" | "PAK" | "VOLUNTEER";

export type HoursStaff = {
  id: string;
  name: string;
  category: Category;
  departmentCode: string;
};

/** AC-3/AC-11 (Q-133): institution-wide readers see all lecturers, unit-scoped ones their units'. */
export async function hoursScopeWhere(
  user: UserRef,
  permission: string,
): Promise<Prisma.StaffWhereInput> {
  const g = await grantScopes(user, permission);
  if (g.institution) return {};
  if (g.facultyIds.length === 0 && g.departmentIds.length === 0) return { id: { in: [] } };
  return {
    OR: [
      { departmentId: { in: g.departmentIds } },
      { department: { facultyId: { in: g.facultyIds } } },
    ],
  };
}

const staffSelect = {
  id: true,
  category: true,
  department: { select: { code: true } },
  person: { select: { firstName: true, lastName: true } },
} as const;

const staffRef = (s: {
  id: string;
  category: Category;
  department: { code: string } | null;
  person: { firstName: string; lastName: string };
}): HoursStaff => ({
  id: s.id,
  name: `${s.person.lastName} ${s.person.firstName}`,
  category: s.category,
  departmentCode: s.department?.code ?? "",
});

export type CourseInfo = {
  courseCode: string;
  courseName: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  semester: number;
  groupLabel: string;
};

export type HoursData = {
  staff: Map<string, HoursStaff>;
  lines: HoursLine[];
  courses: Map<string, CourseInfo>;
  approvals: Map<
    string,
    { status: "APPROVED" | "OPEN"; heldHours: number; adjustmentHours: number }
  >;
  sessions: HoursSession[];
  adjustments: AdjustmentView[];
};

export type AdjustmentView = {
  id: string;
  staffId: string;
  assignmentId: string;
  month: string;
  hours: number;
  reason: string;
  createdAt: string;
};

const approvalKey = (staffId: string, month: string) => `${staffId}|${month}`;

/** Sessions, adjustments and approvals of the given lecturers for the academic year, aggregated. */
export async function loadHours(
  staff: HoursStaff[],
  yearId: string,
  range?: { from: string; to: string },
): Promise<HoursData> {
  const staffIds = staff.map((s) => s.id);
  const [sessions, adjustmentRows, approvalRows] = await Promise.all([
    sessionsForHours({ yearId, staffIds, ...range }),
    db.hoursAdjustment.findMany({
      where: {
        staffId: { in: staffIds },
        assignment: { group: { academicYearId: yearId } },
        ...(range ? { month: monthsBetween(range) } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
    db.hoursApproval.findMany({ where: { staffId: { in: staffIds } } }),
  ]);
  const adjustments: AdjustmentView[] = adjustmentRows.map((a) => ({
    id: a.id,
    staffId: a.staffId,
    assignmentId: a.assignmentId,
    month: a.month,
    hours: a.hours,
    reason: a.reason,
    createdAt: a.createdAt.toISOString(),
  }));
  const lines = aggregateHours(
    sessions.map((s) => ({
      assignmentId: s.assignmentId,
      staffId: s.staffId,
      date: s.date,
      hours: s.hours,
      status: s.status,
    })),
    adjustments,
    todayInTirane(),
  );
  const courses = new Map<string, CourseInfo>();
  for (const s of sessions)
    courses.set(s.assignmentId, {
      courseCode: s.courseCode,
      courseName: s.courseName,
      kind: s.kind,
      semester: s.semester,
      groupLabel: s.groupLabel,
    });
  // assignments with adjustments only (no session yet) still need a label
  for (const id of new Set(lines.map((l) => l.assignmentId))) {
    if (courses.has(id)) continue;
    const a = await getAssignmentContext(id);
    if (a)
      courses.set(id, {
        courseCode: a.courseCode,
        courseName: a.courseName,
        kind: a.kind,
        semester: a.semester,
        groupLabel: `${a.programCode} · ${a.cohortName} · ${a.groupName}`,
      });
  }
  return {
    staff: new Map(staff.map((s) => [s.id, s])),
    lines,
    courses,
    sessions,
    adjustments,
    approvals: new Map(approvalRows.map((a) => [approvalKey(a.staffId, a.month), a])),
  };
}

function monthsBetween(range: { from: string; to: string }): { gte: string; lte: string } {
  return { gte: range.from.slice(0, 7), lte: range.to.slice(0, 7) };
}

export function stateOf(data: HoursData, t: MonthTotals): ApprovalState {
  return approvalState(data.approvals.get(approvalKey(t.staffId, t.month)), t);
}

// ---- tables --------------------------------------------------------------------------------

export type HoursFilters = {
  yearId: string;
  month?: string;
  semester?: string;
  category?: string;
  department?: string;
  lecturer?: string;
  course?: string;
  state?: string;
};

async function readableStaff(user: UserRef, f: HoursFilters): Promise<HoursStaff[]> {
  const and: Prisma.StaffWhereInput[] = [
    await hoursScopeWhere(user, "hr.hours.read"),
    { kind: "ACADEMIC" },
  ];
  if (f.category === "PAE" || f.category === "PAK" || f.category === "VOLUNTEER")
    and.push({ category: f.category });
  if (f.department)
    and.push({ department: { code: { contains: f.department, mode: "insensitive" } } });
  if (f.lecturer)
    and.push({
      person: {
        OR: [
          { lastName: { contains: f.lecturer, mode: "insensitive" } },
          { firstName: { contains: f.lecturer, mode: "insensitive" } },
        ],
      },
    });
  const rows = await db.staff.findMany({ where: { AND: and }, select: staffSelect });
  return rows.map(staffRef);
}

const monthRange = (month?: string) => (month && isMonth(month) ? monthBounds(month) : undefined);

export type MonthRow = MonthTotals & {
  key: string;
  name: string;
  category: Category;
  departmentCode: string;
  state: ApprovalState;
};

/** AC-3: one row per lecturer and month. */
export async function monthRows(user: UserRef, f: HoursFilters): Promise<MonthRow[]> {
  const staff = await readableStaff(user, f);
  const range = monthRange(f.month);
  const data = await loadHours(staff, f.yearId, range);
  let rows = rollupByMonth(data.lines).map((t) => {
    const s = data.staff.get(t.staffId)!;
    return {
      ...t,
      key: `${t.staffId}|${t.month}`,
      name: s.name,
      category: s.category,
      departmentCode: s.departmentCode,
      state: stateOf(data, t),
    };
  });
  if (f.state) rows = rows.filter((r) => r.state === f.state);
  return rows;
}

export type CourseRow = HoursLine &
  CourseInfo & {
    key: string;
    name: string;
    category: Category;
    departmentCode: string;
  };

/** AC-4: one row per lecturer, course assignment and month. */
export async function courseRows(user: UserRef, f: HoursFilters): Promise<CourseRow[]> {
  const staff = await readableStaff(user, f);
  const data = await loadHours(staff, f.yearId, monthRange(f.month));
  const semester = f.semester ? Number(f.semester) : undefined;
  const course = f.course?.toLowerCase();
  return data.lines
    .map((l) => {
      const s = data.staff.get(l.staffId)!;
      const c = data.courses.get(l.assignmentId);
      return {
        ...l,
        key: `${l.assignmentId}|${l.month}`,
        name: s.name,
        category: s.category,
        departmentCode: s.departmentCode,
        courseCode: c?.courseCode ?? "",
        courseName: c?.courseName ?? "",
        kind: c?.kind ?? "LECTURE",
        semester: c?.semester ?? 0,
        groupLabel: c?.groupLabel ?? "",
      } satisfies CourseRow;
    })
    .filter(
      (r) =>
        (semester === undefined || r.semester === semester) &&
        (!course || `${r.courseCode} ${r.courseName}`.toLowerCase().includes(course)),
    );
}

/** AC-4: totals of the filtered rows per category (PAE / PAK / volunteer). */
export function totalsByCategory(rows: readonly { category: Category; total: number }[]) {
  const out: Record<Category, number> = { PAE: 0, PAK: 0, VOLUNTEER: 0 };
  for (const r of rows) out[r.category] += r.total;
  return out;
}

// ---- detail pages -----------------------------------------------------------------------------

export type MonthDetail = {
  staff: HoursStaff;
  month: string;
  yearId: string;
  state: ApprovalState;
  totals: MonthTotals;
  lines: (HoursLine & CourseInfo)[];
  sessions: HoursSession[];
  adjustments: AdjustmentView[];
  approvedAt: string | null;
  can: { approve: boolean; adjust: boolean };
};

const emptyTotals = (staffId: string, month: string): MonthTotals => ({
  staffId,
  month,
  sessions: 0,
  heldHours: 0,
  adjustmentHours: 0,
  total: 0,
  pending: 0,
});

function detailOf(
  data: HoursData,
  staff: HoursStaff,
  month: string,
  yearId: string,
): Omit<MonthDetail, "can" | "approvedAt"> {
  const lines = data.lines
    .filter((l) => l.month === month)
    .map((l) => ({
      ...l,
      ...(data.courses.get(l.assignmentId) ?? {
        courseCode: "",
        courseName: "",
        kind: "LECTURE" as const,
        semester: 0,
        groupLabel: "",
      }),
    }));
  const totals =
    rollupByMonth(data.lines.filter((l) => l.month === month))[0] ?? emptyTotals(staff.id, month);
  const approval = data.approvals.get(approvalKey(staff.id, month));
  const { from, to } = monthBounds(month);
  return {
    staff,
    month,
    yearId,
    state: approvalState(approval, totals),
    totals,
    lines,
    sessions: data.sessions.filter((s) => s.date >= from && s.date <= to),
    adjustments: data.adjustments.filter((a) => a.month === month),
  };
}

/** AC-5: null when the lecturer does not exist or is outside the reader's scope. */
export async function getMonthDetail(
  user: UserRef,
  staffId: string,
  month: string,
  yearId: string,
): Promise<MonthDetail | null> {
  if (!isMonth(month)) return null;
  const row = await db.staff.findFirst({
    where: {
      AND: [{ id: staffId, kind: "ACADEMIC" }, await hoursScopeWhere(user, "hr.hours.read")],
    },
    select: staffSelect,
  });
  if (!row) return null;
  const staff = staffRef(row);
  const data = await loadHours([staff], yearId, monthBounds(month));
  const target = { kind: "staff", id: staffId } as const;
  const [approve, adjust] = await Promise.all([
    can(user, "hr.hours.approve", target),
    can(user, "hr.hours.adjust", target),
  ]);
  const approval = await db.hoursApproval.findUnique({
    where: { staffId_month: { staffId, month } },
    select: { decidedAt: true },
  });
  return {
    ...detailOf(data, staff, month, yearId),
    approvedAt: approval ? approval.decidedAt.toISOString() : null,
    can: { approve, adjust },
  };
}

export type OwnHours = {
  staff: HoursStaff;
  yearId: string;
  months: (MonthTotals & { state: ApprovalState })[];
  selected: Omit<MonthDetail, "can" | "approvedAt"> | null;
};

/** AC-2: the signed-in lecturer's own months; null when the user has no staff record. */
export async function getOwnHours(
  userId: string,
  yearId: string,
  month?: string,
): Promise<OwnHours | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId) return null;
  const row = await db.staff.findUnique({
    where: { personId: user.personId },
    select: staffSelect,
  });
  if (!row) return null;
  const staff = staffRef(row);
  const data = await loadHours([staff], yearId);
  const months = rollupByMonth(data.lines).map((t) => ({ ...t, state: stateOf(data, t) }));
  const chosen = month && isMonth(month) ? month : months.at(-1)?.month;
  return {
    staff,
    yearId,
    months: months.reverse(),
    selected: chosen ? detailOf(data, staff, chosen, yearId) : null,
  };
}
