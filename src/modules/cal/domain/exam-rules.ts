// Pure exam rules (CAL-03). Days are `YYYY-MM-DD`, times are minutes from midnight.
import { timesOverlap } from "./timetable-rules";

export const SESSION_TYPES = ["WINTER", "SUMMER", "AUTUMN", "MINI"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];
export const MAX_EXAMINERS = 6;

const isDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/** AC-1: dates valid, ordered and inside the academic year. */
export function validateSession(s: {
  startDate: string;
  endDate: string;
  yearStart: string;
  yearEnd: string;
}): Partial<Record<"startDate" | "endDate", string>> {
  const e: Partial<Record<"startDate" | "endDate", string>> = {};
  if (!isDay(s.startDate)) e.startDate = "invalidDate";
  if (!isDay(s.endDate)) e.endDate = "invalidDate";
  if (!e.startDate && !e.endDate && s.endDate < s.startDate) e.endDate = "endBeforeStart";
  if (!e.startDate && (s.startDate < s.yearStart || s.startDate > s.yearEnd))
    e.startDate = "outsideYear";
  if (!e.endDate && (s.endDate < s.yearStart || s.endDate > s.yearEnd)) e.endDate = "outsideYear";
  return e;
}

/** AC-2, AC-3: times valid and the date inside the session. */
export function validateSitting(s: {
  date: string;
  startMinute: number;
  endMinute: number;
  room: string | null;
  sessionStart: string;
  sessionEnd: string;
}): Partial<Record<"date" | "startMinute" | "endMinute" | "room", string>> {
  const e: Partial<Record<"date" | "startMinute" | "endMinute" | "room", string>> = {};
  if (!isDay(s.date)) e.date = "invalidDate";
  else if (s.date < s.sessionStart || s.date > s.sessionEnd) e.date = "outsideSession";
  if (!Number.isInteger(s.startMinute) || s.startMinute < 0 || s.startMinute >= 1440)
    e.startMinute = "timeRange";
  if (!Number.isInteger(s.endMinute) || s.endMinute <= 0 || s.endMinute > 1440)
    e.endMinute = "timeRange";
  if (!e.startMinute && !e.endMinute && s.endMinute <= s.startMinute)
    e.endMinute = "endBeforeStart";
  if (s.room !== null && s.room.length > 50) e.room = "tooLong";
  return e;
}

/** AC-4 (SRC-052, Q-76): the mini-session takes only courses of the program's final year of study. */
export const miniSessionAllows = (yearOfStudy: number, durationYears: number): boolean =>
  yearOfStudy === durationYears;

export type Sitting = {
  id?: string;
  date: string;
  startMinute: number;
  endMinute: number;
  room: string | null;
  /** Students of the same plan and year of study sit the same groups (Q-77). */
  planId: string;
  yearOfStudy: number;
  examinerIds: readonly string[];
  /** shown in clash messages, e.g. "DEMO101 09:00–11:00" */
  label: string;
};

export type ExamClash = { kind: "GROUP" | "EXAMINER" | "ROOM"; other: Sitting };

const sameRoom = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** AC-5: every clash of `sitting` with `others` (a sitting never clashes with itself). */
export function findExamClashes(sitting: Sitting, others: readonly Sitting[]): ExamClash[] {
  const out: ExamClash[] = [];
  for (const o of others) {
    if (sitting.id && o.id === sitting.id) continue;
    if (o.date !== sitting.date || !timesOverlap(sitting, o)) continue;
    if (o.planId === sitting.planId && o.yearOfStudy === sitting.yearOfStudy)
      out.push({ kind: "GROUP", other: o });
    if (o.examinerIds.some((x) => sitting.examinerIds.includes(x)))
      out.push({ kind: "EXAMINER", other: o });
    if (sameRoom(o.room, sitting.room)) out.push({ kind: "ROOM", other: o });
  }
  return out;
}

/** AC-6: sittings that would fall outside new session dates. */
export const sittingsOutside = (
  days: readonly string[],
  start: string,
  end: string,
): string[] => days.filter((d) => d < start || d > end);

/** Sittings in date and time order. */
export const bySchedule = <T extends Pick<Sitting, "date" | "startMinute">>(a: T, b: T): number =>
  a.date.localeCompare(b.date) || a.startMinute - b.startMinute;
