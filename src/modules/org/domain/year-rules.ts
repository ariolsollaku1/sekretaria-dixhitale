// Pure academic-year rules (no I/O). Dates are `YYYY-MM-DD` strings: calendar days, never instants,
// so there is no time-zone arithmetic to get wrong.

export type DayRange = { start: string; end: string };

export type YearInput = {
  startDate: string;
  endDate: string;
  semester1: DayRange;
  semester2: DayRange;
};

export type YearStatus = "PLANNED" | "CURRENT" | "CLOSED";

/** field -> error codes (keys under `org.errors.*`) */
export type YearErrors = Partial<
  Record<"startDate" | "endDate" | "semester1" | "semester2", string[]>
>;

export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** AC-1: "2026-2027" from the year of each date. */
export function deriveCode(startDate: string, endDate: string): string {
  return `${startDate.slice(0, 4)}-${endDate.slice(0, 4)}`;
}

/** String comparison is correct for YYYY-MM-DD. */
const before = (a: string, b: string) => a < b;

function addError(errors: YearErrors, field: keyof YearErrors, code: string) {
  (errors[field] ??= []).push(code);
}

/**
 * AC-3: the year is ordered, does not overlap another year (end days inclusive), and its two
 * semesters lie inside it, are ordered and do not overlap. Returns {} when valid.
 */
export function validateYear(
  input: YearInput,
  others: readonly { startDate: string; endDate: string }[],
): YearErrors {
  const errors: YearErrors = {};
  const days: [keyof YearErrors, string][] = [
    ["startDate", input.startDate],
    ["endDate", input.endDate],
    ["semester1", input.semester1.start],
    ["semester1", input.semester1.end],
    ["semester2", input.semester2.start],
    ["semester2", input.semester2.end],
  ];
  const invalid = days.filter(([, v]) => !isDay(v));
  for (const [field] of invalid) addError(errors, field, "invalidDate");
  if (invalid.length > 0) return errors;

  if (!before(input.startDate, input.endDate)) addError(errors, "endDate", "endBeforeStart");

  for (const o of others) {
    // Closed ranges [start, end] overlap unless one ends before the other starts.
    if (!(input.endDate < o.startDate || o.endDate < input.startDate)) {
      addError(errors, "startDate", "overlap");
      break;
    }
  }

  const semesters: ["semester1" | "semester2", DayRange][] = [
    ["semester1", input.semester1],
    ["semester2", input.semester2],
  ];
  for (const [field, s] of semesters) {
    if (!before(s.start, s.end)) addError(errors, field, "endBeforeStart");
    if (s.start < input.startDate || s.end > input.endDate)
      addError(errors, field, "semesterOutside");
  }
  // Semester 1 must finish before semester 2 starts.
  if (!(input.semester1.end < input.semester2.start))
    addError(errors, "semester2", "semesterOrder");

  return errors;
}

export const hasErrors = (e: YearErrors) => Object.keys(e).length > 0;

export type TransitionResult = { ok: true } | { ok: false; reason: "NOT_PLANNED" };

/** AC-6: only a PLANNED year can become current; CURRENT closes only via the next one; CLOSED is final. */
export function canMakeCurrent(status: YearStatus): TransitionResult {
  return status === "PLANNED" ? { ok: true } : { ok: false, reason: "NOT_PLANNED" };
}

/** AC-7: closed years are read-only. */
export const isEditable = (status: YearStatus) => status !== "CLOSED";
