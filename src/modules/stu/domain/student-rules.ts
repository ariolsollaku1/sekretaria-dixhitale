// Pure student rules (STU-01). No I/O.

export const NIM_MAX = 30;

/** AC-1: the NIM is typed text from the SMIAL, normalized to upper case; blank means "none yet". */
export function normalizeNim(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "" ? null : v;
}

export const validNim = (nim: string): boolean =>
  nim.length <= NIM_MAX && !/[\u0000-\u001f]/.test(nim);

/** AC-1: internal numbers are 6-digit zero-padded sequences (Q-34 working assumption). */
export const STUDENT_NUMBER_PATTERN = /^\d{6,}$/;
export const isStudentNumber = (value: string): boolean => STUDENT_NUMBER_PATTERN.test(value);

export type EnrollmentStatus = "ACTIVE" | "SUSPENDED" | "DEREGISTERED" | "GRADUATED";

/** AC-3: an enrollment blocks a second one in the same program while it is open. */
export const isOpenStatus = (status: EnrollmentStatus): boolean =>
  status === "ACTIVE" || status === "SUSPENDED";

export type YearRegistrationErrors = Partial<
  Record<"yearOfStudy" | "groupId" | "academicYearId" | "enrollmentId", string>
>;

/**
 * AC-7: the year of study exists in the program; the group is a group of the enrollment's cohort
 * for exactly this academic year and year of study; the enrollment is ACTIVE; the year is open.
 */
export function validateYearRegistration(input: {
  yearOfStudy: number;
  durationYears: number;
  enrollmentStatus: EnrollmentStatus;
  yearStatus: "PLANNED" | "CURRENT" | "CLOSED";
  group: { cohortId: string; academicYearId: string; yearOfStudy: number; active: boolean } | null;
  enrollment: { cohortId: string };
  academicYearId: string;
}): YearRegistrationErrors {
  const errors: YearRegistrationErrors = {};
  if (input.enrollmentStatus !== "ACTIVE") errors.enrollmentId = "enrollmentNotActive";
  if (input.yearStatus === "CLOSED") errors.academicYearId = "yearClosed";
  if (
    !Number.isInteger(input.yearOfStudy) ||
    input.yearOfStudy < 1 ||
    input.yearOfStudy > input.durationYears
  )
    errors.yearOfStudy = "yearOutOfRange";
  const g = input.group;
  if (
    !g ||
    !g.active ||
    g.cohortId !== input.enrollment.cohortId ||
    g.academicYearId !== input.academicYearId ||
    g.yearOfStudy !== input.yearOfStudy
  )
    errors.groupId = "groupMismatch";
  return errors;
}
