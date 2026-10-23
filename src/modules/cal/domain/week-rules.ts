// Pure calendar rules (no I/O). Dates are `YYYY-MM-DD` strings: calendar days, not instants.

const DAY_MS = 86_400_000;

export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const toMs = (day: string) => new Date(`${day}T00:00:00Z`).getTime();
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (day: string, days: number): string => fromMs(toMs(day) + days * DAY_MS);
export const diffDays = (a: string, b: string): number => Math.round((toMs(b) - toMs(a)) / DAY_MS);

/** 0 = Monday … 6 = Sunday (Q-29: weeks start on Monday). */
export function weekday(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export const mondayOf = (day: string): string => addDays(day, -weekday(day));

/** AC-6: week 1 is the week containing the year's start date; earlier days give week <= 0. */
export function weekNumber(day: string, yearStart: string): number {
  return Math.floor(diffDays(mondayOf(yearStart), day) / 7) + 1;
}

export type Week = { number: number; start: string; end: string };

/** Every week that overlaps [from, to], numbered against the year start. */
export function weeksBetween(from: string, to: string, yearStart: string): Week[] {
  const weeks: Week[] = [];
  for (let monday = mondayOf(from); monday <= to; monday = addDays(monday, 7)) {
    weeks.push({
      number: weekNumber(monday, yearStart),
      start: monday,
      end: addDays(monday, 6),
    });
  }
  return weeks;
}

/** AC-10: whole weeks closest to the difference between the two year starts (weekdays are kept). */
export function weekShiftDays(oldYearStart: string, newYearStart: string): number {
  return Math.round(diffDays(oldYearStart, newYearStart) / 7) * 7;
}

export type ShiftResult<T extends { startDate: string; endDate: string }> = {
  kept: T[];
  skipped: number;
};

/** AC-10: move events by `days`; those that would leave the target year are skipped and counted. */
export function shiftEvents<T extends { startDate: string; endDate: string }>(
  events: readonly T[],
  days: number,
  target: { startDate: string; endDate: string },
): ShiftResult<T> {
  const kept: T[] = [];
  let skipped = 0;
  for (const e of events) {
    const startDate = addDays(e.startDate, days);
    const endDate = addDays(e.endDate, days);
    if (startDate < target.startDate || endDate > target.endDate) skipped += 1;
    else kept.push({ ...e, startDate, endDate });
  }
  return { kept, skipped };
}

/** AC-7: the Monday-first grid of a month, as full weeks of 7 days ("YYYY-MM" input). */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const lastDay = fromMs(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0));
  const weeks: string[][] = [];
  for (let monday = mondayOf(first); monday <= lastDay; monday = addDays(monday, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  return weeks;
}

export const overlaps = (
  e: { startDate: string; endDate: string },
  from: string,
  to: string,
): boolean => e.startDate <= to && e.endDate >= from;
