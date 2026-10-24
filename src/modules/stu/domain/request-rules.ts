// Pure rules of the student requests (STU-07). No I/O.

export const DEREGISTRATION_HANDLER = "stu.deregistration";
export const RECOGNITION_HANDLER = "stu.recognition";

/**
 * AC-3 (Q-70): the effective date of an approved deregistration is the date the student asked for,
 * moved into the range from `floor` (start of the enrollment / previous status change) to `today`.
 * All values are `YYYY-MM-DD`, which compare correctly as strings.
 */
export function clampEffectiveDate(
  requested: string | null | undefined,
  floor: string,
  today: string,
): string {
  const day = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  if (day > today) return today;
  if (day < floor) return floor;
  return day;
}

export type OpenEnrollment = { id: string; programCode: string };
export type PickResult =
  | { ok: true; enrollmentId: string }
  | { ok: false; code: "NO_OPEN_ENROLLMENT" | "AMBIGUOUS_ENROLLMENT" };

/**
 * AC-4 (Q-70): the open enrollment a request is about. A program code that names exactly one open
 * enrollment selects it; without a code, a single open enrollment is the one; anything else is
 * ambiguous and the approval is refused.
 */
export function pickEnrollment(open: OpenEnrollment[], programAnswer?: string | null): PickResult {
  if (open.length === 0) return { ok: false, code: "NO_OPEN_ENROLLMENT" };
  const code = programAnswer?.trim().toLowerCase();
  if (code) {
    const matches = open.filter((e) => e.programCode.toLowerCase() === code);
    return matches.length === 1
      ? { ok: true, enrollmentId: matches[0]!.id }
      : { ok: false, code: "AMBIGUOUS_ENROLLMENT" };
  }
  return open.length === 1
    ? { ok: true, enrollmentId: open[0]!.id }
    : { ok: false, code: "AMBIGUOUS_ENROLLMENT" };
}

/** AC-2 (Q-71): a public requester is the student with this number and this date of birth. */
export function identityMatches(
  given: { studentNumber?: unknown; birthDate?: unknown },
  record: { studentNumber: string; birthDate: string },
): boolean {
  return (
    typeof given.studentNumber === "string" &&
    typeof given.birthDate === "string" &&
    given.studentNumber.trim() === record.studentNumber &&
    given.birthDate.trim() === record.birthDate
  );
}
