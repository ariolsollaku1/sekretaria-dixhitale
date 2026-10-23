// Pure course rules (CUR-01). No I/O. Limits are the Q-28 working assumption.
export const MAX_CREDITS = 60;
export const MAX_HOURS = 500;

export const COURSE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,19}$/;

export function normalizeCourseCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateCourseCode(
  raw: string,
): { ok: true; code: string } | { ok: false; reason: "invalidCourseCode" } {
  const code = normalizeCourseCode(raw);
  return COURSE_CODE_PATTERN.test(code)
    ? { ok: true, code }
    : { ok: false, reason: "invalidCourseCode" };
}

export const CATEGORY_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,19}$/;

export function validateCategoryCode(
  raw: string,
): { ok: true; code: string } | { ok: false; reason: "invalidCategoryCode" } {
  const code = raw.trim().toUpperCase();
  return CATEGORY_CODE_PATTERN.test(code)
    ? { ok: true, code }
    : { ok: false, reason: "invalidCategoryCode" };
}

/** Accepts "6", "6.0", "6,0" and " 6 "; rejects anything fractional or non-numeric. */
export function parseWholeNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!/^\d+(\.0+)?$/.test(text)) return null;
  return Number(text);
}

export type CourseNumbers = {
  defaultCredits: number;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
};
export type CourseNumberErrors = Partial<Record<keyof CourseNumbers, string>>;

export function validateCourseNumbers(n: CourseNumbers): CourseNumberErrors {
  const errors: CourseNumberErrors = {};
  if (!Number.isInteger(n.defaultCredits) || n.defaultCredits < 0 || n.defaultCredits > MAX_CREDITS)
    errors.defaultCredits = "creditsRange";
  for (const key of ["hoursLecture", "hoursSeminar", "hoursLab"] as const) {
    if (!Number.isInteger(n[key]) || n[key] < 0 || n[key] > MAX_HOURS) errors[key] = "hoursRange";
  }
  return errors;
}
