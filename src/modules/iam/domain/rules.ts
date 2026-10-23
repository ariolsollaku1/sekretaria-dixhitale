// Pure IAM rules (no I/O). AC-7: never lock the institution out of its own administration.

export type SysadminFacts = {
  actorId: string;
  targetId: string;
  /** Whether the target currently holds an active sysadmin assignment. */
  targetIsActiveSysadmin: boolean;
  /** Number of active users that hold an active sysadmin assignment. */
  activeSysadminCount: number;
};

export type RuleResult =
  { ok: true } | { ok: false; reason: "SELF_DEACTIVATION" | "LAST_SYSADMIN" };

/** AC-7: not yourself, and not the last active sysadmin. */
export function canDeactivate(facts: SysadminFacts): RuleResult {
  if (facts.actorId === facts.targetId) return { ok: false, reason: "SELF_DEACTIVATION" };
  if (facts.targetIsActiveSysadmin && facts.activeSysadminCount <= 1)
    return { ok: false, reason: "LAST_SYSADMIN" };
  return { ok: true };
}

/** AC-7: removing the sysadmin role from the last active sysadmin is refused as well. */
export function canRevokeSysadmin(
  facts: Pick<SysadminFacts, "targetIsActiveSysadmin" | "activeSysadminCount">,
): RuleResult {
  if (facts.targetIsActiveSysadmin && facts.activeSysadminCount <= 1)
    return { ok: false, reason: "LAST_SYSADMIN" };
  return { ok: true };
}

/** AC-10: activation can be re-sent only to accounts that never signed in. */
export function canResendActivation(user: { lastLoginAt: Date | null; active: boolean }): boolean {
  return user.active && user.lastLoginAt === null;
}

export const displayName = (firstName: string, lastName: string) =>
  `${firstName.trim()} ${lastName.trim()}`.trim();

/** App user name -> first/last name for the identity provider (first word vs the rest). */
export function splitName(name: string): { firstName: string; lastName: string } {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
