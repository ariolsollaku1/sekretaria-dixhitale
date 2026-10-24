// FIN-04: when an installment is reminded. Pure; days are "YYYY-MM-DD" in Europe/Tirane (Q-144).

export const DEFAULT_REMINDER_DAYS = 14; // SRC-086: two weeks before each installment

/** Setting `fin.reminderDaysBefore`: a whole number of days from 1 to 90, else the default. */
export function resolveReminderDays(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 90
    ? value
    : DEFAULT_REMINDER_DAYS;
}

/** Setting `fin.reminderOverdueAfterDays`: a whole number from 1 to 365 turns the overdue notice on, else off. */
export function resolveOverdueDays(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 365
    ? value
    : null;
}

const DAY_MS = 86_400_000;
const ms = (day: string) => new Date(`${day}T00:00:00Z`).getTime();

/** Whole days from `today` to `due` (negative once past due). */
export const daysUntil = (due: string, today: string): number =>
  Math.round((ms(due) - ms(today)) / DAY_MS);

export type ReminderKind = "UPCOMING" | "OVERDUE";

/**
 * AC-1, AC-3: the reminder an installment calls for today, or null. Nothing is owed -> nothing is sent;
 * an installment falling due within the window is "upcoming" (also due today); one overdue by at least
 * `overdueAfter` days is "overdue" (only when that notice is on).
 */
export function reminderFor(args: {
  dueDate: string;
  today: string;
  outstandingCents: number;
  daysBefore: number;
  overdueAfter: number | null;
}): ReminderKind | null {
  if (args.outstandingCents <= 0) return null;
  const left = daysUntil(args.dueDate, args.today);
  if (left >= 0) return left <= args.daysBefore ? "UPCOMING" : null;
  return args.overdueAfter !== null && -left >= args.overdueAfter ? "OVERDUE" : null;
}

/** "2026-11-05" -> "05.11.2026" for the message text. */
export const displayDay = (day: string): string => day.split("-").reverse().join(".");
