// Pure rules of the account lifecycle (IAM-02). No I/O.
import { ALLOWED_SCOPES, ROLES, type Role, type ScopeType } from "@/lib/authz/roles";

export type AccountKind = "STUDENT" | "STAFF";

/**
 * Q-128: a person keeps access while they have an open enrollment (active or suspended) or an active
 * staff record. SRC-037: alumni have none.
 */
export function shouldHaveAccess(facts: {
  openEnrollments: number;
  activeStaff: boolean;
}): boolean {
  return facts.openEnrollments > 0 || facts.activeStaff;
}

export type AccountState = "none" | "pending" | "active" | "disabled";

/** AC-9: what the account panel shows. */
export function accountState(
  user: { active: boolean; lastLoginAt: Date | null } | null,
): AccountState {
  if (!user) return "none";
  if (!user.active) return "disabled";
  return user.lastLoginAt === null ? "pending" : "active";
}

/** Q-129: the role gets its first allowed scope, which must need no target. */
export const defaultScope = (role: Role): ScopeType => ALLOWED_SCOPES[role][0]!;

/** AC-4: roles HR may give; scoped roles and the administrator stay in IAM-01. */
export const STAFF_ACCOUNT_ROLES: readonly Role[] = ROLES.filter(
  (r) => r !== "sysadmin" && r !== "student" && ["INSTITUTION", "SELF"].includes(defaultScope(r)),
);

export const isStaffAccountRole = (role: string): role is Role =>
  (STAFF_ACCOUNT_ROLES as readonly string[]).includes(role);

/** Q-129: lecturers by default for academic staff; administrative staff must be chosen. */
export function defaultStaffRole(kind: "ACADEMIC" | "ADMINISTRATIVE"): Role | null {
  return kind === "ACADEMIC" ? "lecturer" : null;
}

export type SkipReason = "noEmail" | "noOpenEnrollment" | "hasAccount" | "emailTaken";

export type CohortOutcome =
  | { studentId: string; result: "created" | "reminded" }
  | { studentId: string; result: "skipped"; reason: SkipReason };

/** AC-10: the counts shown after the cohort run. */
export function summarize(outcomes: readonly CohortOutcome[]) {
  const reasons: Partial<Record<SkipReason, number>> = {};
  let created = 0;
  let reminded = 0;
  let skipped = 0;
  for (const o of outcomes) {
    if (o.result === "created") created++;
    else if (o.result === "reminded") reminded++;
    else if (o.result === "skipped") {
      skipped++;
      reasons[o.reason] = (reasons[o.reason] ?? 0) + 1;
    }
  }
  return { created, reminded, skipped, reasons };
}

/** Days from `from` to `now`, never negative (never-activated report). */
export const daysSince = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
