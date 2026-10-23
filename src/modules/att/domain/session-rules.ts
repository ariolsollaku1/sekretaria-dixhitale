// Pure attendance rules (ATT-01). Days are `YYYY-MM-DD`, times are minutes from midnight.
const DAY_MS = 86_400_000;
const ms = (day: string) => new Date(`${day}T00:00:00Z`).getTime();

export const MAX_RANGE_DAYS = 120;
export const DEFAULT_WINDOW_DAYS = 7;
export const MIN_HOURS = 1;
export const MAX_HOURS = 12;
/** Q-60: an academic hour is 45 minutes. */
export const ACADEMIC_HOUR_MINUTES = 45;

export function isDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
  );
}

export const addDays = (day: string, n: number) => new Date(ms(day) + n * DAY_MS).toISOString().slice(0, 10);
export const diffDays = (from: string, to: string) => Math.round((ms(to) - ms(from)) / DAY_MS);
/** 1 = Monday … 7 = Sunday, like the timetable. */
export const isoWeekday = (day: string) => ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Today's date in Europe/Tirane (Q-61). */
export function todayInTirane(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Q-60: default hours of a session from its length: round(minutes / 45), at least 1. */
export function defaultHours(startMinute: number, endMinute: number): number {
  const h = Math.round((endMinute - startMinute) / ACADEMIC_HOUR_MINUTES);
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, h));
}

/** The setting `att.editWindowDays`: a whole number >= 0, else the default (Q-61). */
export function resolveWindowDays(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_WINDOW_DAYS;
}

export type SlotLike = {
  id: string;
  assignmentId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validTo: string;
};
export type PlannedSession = {
  date: string;
  startMinute: number;
  endMinute: number;
  hours: number;
  timetableEntryId: string;
};

/** AC-2: the sessions the timetable entries imply for `from..to` (inclusive), in date order. */
export function sessionsFromTimetable(
  entries: readonly SlotLike[],
  from: string,
  to: string,
): PlannedSession[] {
  const out: PlannedSession[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const wd = isoWeekday(day);
    for (const e of entries) {
      if (e.weekday === wd && day >= e.validFrom && day <= e.validTo)
        out.push({
          date: day,
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          hours: defaultHours(e.startMinute, e.endMinute),
          timetableEntryId: e.id,
        });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
}

export type RangeErrors = Partial<Record<"from" | "to", string>>;
/** AC-2: a valid range of at most 120 days inside the academic year. */
export function validateRange(
  from: string,
  to: string,
  year: { startDate: string; endDate: string },
): RangeErrors {
  const e: RangeErrors = {};
  if (!isDay(from)) e.from = "invalidDate";
  if (!isDay(to)) e.to = "invalidDate";
  if (e.from || e.to) return e;
  if (to < from) e.to = "endBeforeStart";
  else if (diffDays(from, to) + 1 > MAX_RANGE_DAYS) e.to = "rangeTooLong";
  if (from < year.startDate || from > year.endDate) e.from = "outsideYear";
  if (!e.to && (to < year.startDate || to > year.endDate)) e.to = "outsideYear";
  return e;
}

export type SessionErrors = Partial<
  Record<"date" | "startMinute" | "endMinute" | "hours", string>
>;
/** AC-1/AC-3 */
export function validateSession(
  s: { date: string; startMinute: number; endMinute: number; hours: number },
  year: { startDate: string; endDate: string },
): SessionErrors {
  const e: SessionErrors = {};
  if (!isDay(s.date)) e.date = "invalidDate";
  else if (s.date < year.startDate || s.date > year.endDate) e.date = "outsideYear";
  if (!Number.isInteger(s.startMinute) || s.startMinute < 0 || s.startMinute >= 1440)
    e.startMinute = "timeRange";
  if (!Number.isInteger(s.endMinute) || s.endMinute <= 0 || s.endMinute > 1440)
    e.endMinute = "timeRange";
  if (!e.startMinute && !e.endMinute && s.endMinute <= s.startMinute) e.endMinute = "endBeforeStart";
  if (!Number.isInteger(s.hours) || s.hours < MIN_HOURS || s.hours > MAX_HOURS)
    e.hours = "hoursRange";
  return e;
}

export type EditCheck =
  | { ok: true }
  | { ok: false; reason: "FUTURE" | "WINDOW_CLOSED" };

/**
 * AC-6/AC-7: may the owner lecturer record on this session date today? Not before the class day;
 * until `windowDays` days after it (Q-61).
 */
export function lecturerMayRecord(sessionDate: string, today: string, windowDays: number): EditCheck {
  if (sessionDate > today) return { ok: false, reason: "FUTURE" };
  if (diffDays(sessionDate, today) > windowDays) return { ok: false, reason: "WINDOW_CLOSED" };
  return { ok: true };
}

export type Status = "PRESENT" | "ABSENT" | "EXCUSED";
export type MarkInput = { studentId: string; status: Status; note?: string | null };

export type MarkErrors = {
  unknown: string[];
  missing: string[];
  duplicate: string[];
};
/** AC-5: every roster student exactly once, nobody else. */
export function checkMarks(rosterIds: readonly string[], marks: readonly MarkInput[]): MarkErrors {
  const roster = new Set(rosterIds);
  const seen = new Set<string>();
  const duplicate: string[] = [];
  const unknown: string[] = [];
  for (const m of marks) {
    if (!roster.has(m.studentId)) unknown.push(m.studentId);
    else if (seen.has(m.studentId)) duplicate.push(m.studentId);
    seen.add(m.studentId);
  }
  return { unknown, duplicate, missing: rosterIds.filter((id) => !seen.has(id)) };
}
export const marksOk = (e: MarkErrors) =>
  e.unknown.length === 0 && e.missing.length === 0 && e.duplicate.length === 0;

export type Counts = { present: number; absent: number; excused: number };
export function countMarks(marks: readonly { status: Status }[]): Counts {
  const c = { present: 0, absent: 0, excused: 0 };
  for (const m of marks) c[m.status.toLowerCase() as keyof Counts] += 1;
  return c;
}

/** The changed students between the saved marks and the new ones (ids only; for the audit entry). */
export function changedStudents(
  before: readonly MarkInput[],
  after: readonly MarkInput[],
): string[] {
  const old = new Map(before.map((m) => [m.studentId, `${m.status}|${m.note ?? ""}`]));
  return after
    .filter((m) => old.get(m.studentId) !== `${m.status}|${m.note ?? ""}`)
    .map((m) => m.studentId);
}
