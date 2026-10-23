// Pure status-change rules (STU-02). No I/O.
import type { EnrollmentStatus } from "./student-rules";

/** AC-1 (Q-36 working assumption): DEREGISTERED and GRADUATED are final. */
export const TRANSITIONS: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  ACTIVE: ["SUSPENDED", "DEREGISTERED", "GRADUATED"],
  SUSPENDED: ["ACTIVE", "DEREGISTERED"],
  DEREGISTERED: [],
  GRADUATED: [],
};

export const allowedTransitions = (from: EnrollmentStatus): readonly EnrollmentStatus[] =>
  TRANSITIONS[from];
export const canTransition = (from: EnrollmentStatus, to: EnrollmentStatus): boolean =>
  TRANSITIONS[from].includes(to);

/** A transfer is a deregistration plus a new enrollment, so it needs the same source states. */
export const canTransfer = (from: EnrollmentStatus): boolean => canTransition(from, "DEREGISTERED");

/** Closing statuses end the enrollment (`endedAt` = effective date). */
export const endsEnrollment = (to: EnrollmentStatus): boolean =>
  to === "DEREGISTERED" || to === "GRADUATED";

export type ChangeErrors = Partial<Record<"to" | "effectiveDate", string>>;

const isDay = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * AC-3: the change is allowed and the effective date is a real day that is not before the
 * enrollment's start or the previous change, and not after today (days are `YYYY-MM-DD`).
 */
export function validateChange(input: {
  from: EnrollmentStatus;
  to: EnrollmentStatus;
  effectiveDate: string;
  startedAt: string;
  lastEventDate: string | null;
  today: string;
}): ChangeErrors {
  const errors: ChangeErrors = {};
  if (!canTransition(input.from, input.to)) errors.to = "transitionNotAllowed";
  if (!isDay(input.effectiveDate)) errors.effectiveDate = "invalidDate";
  else if (input.effectiveDate < input.startedAt) errors.effectiveDate = "beforeStart";
  else if (input.lastEventDate && input.effectiveDate < input.lastEventDate)
    errors.effectiveDate = "beforePreviousChange";
  else if (input.effectiveDate > input.today) errors.effectiveDate = "inFuture";
  return errors;
}
