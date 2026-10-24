// Pure rules of the staff requests (OFF-01). No I/O.

/** Handler key shared by the four staff request forms. */
export const REQUEST_HANDLER = "off.request";

/** The form keys of the staff requests (AC-1). */
export const LEAVE_FORM = "staff-leave";
export const STAFF_FORM_KEYS = [
  LEAVE_FORM,
  "staff-supplies",
  "staff-certificate",
  "staff-authorization",
] as const;

export const isStaffRequestForm = (key: string): boolean =>
  (STAFF_FORM_KEYS as readonly string[]).includes(key);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** AC-6: a leave may not end before it starts (both are ISO days; a missing one is invalid). */
export function leaveDatesValid(start: unknown, end: unknown): boolean {
  if (typeof start !== "string" || typeof end !== "string") return false;
  if (!DAY.test(start) || !DAY.test(end)) return false;
  return end >= start;
}
