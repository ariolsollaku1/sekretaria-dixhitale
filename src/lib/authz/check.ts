// Pure decision logic (no I/O): given an actor's assignments, decide. Fully unit-tested; the async,
// database-backed wrappers are in guard.ts. Docs: auth.md "Authorization model".
import { ID_SCOPES } from "./roles";
import { isRegisteredPermission, roleGrants } from "./registry";
import type { Actor, Assignment, GrantScopes, Permission, TargetScope } from "./types";

/** AC-4: inside [validFrom, validTo). */
export function isAssignmentActive(a: Assignment, now: Date): boolean {
  return (
    a.validFrom.getTime() <= now.getTime() &&
    (a.validTo === null || now.getTime() < a.validTo.getTime())
  );
}

/** Assignments that grant `permission` right now. A deactivated actor has none (AC-4). */
export function grantingAssignments(
  actor: Actor,
  assignments: readonly Assignment[],
  permission: Permission,
  now: Date,
): Assignment[] {
  if (!isRegisteredPermission(permission)) throw new Error(`Unknown permission "${permission}"`);
  if (!actor.active) return [];
  return assignments.filter((a) => isAssignmentActive(a, now) && roleGrants(a.role, permission));
}

/** AC-5: does this assignment's scope contain the target? */
export function scopeContains(a: Assignment, actor: Actor, target: TargetScope): boolean {
  switch (a.scopeType) {
    case "INSTITUTION":
      return true;
    case "FACULTY":
      return a.scopeId !== null && target.facultyId === a.scopeId;
    case "DEPARTMENT":
      return a.scopeId !== null && target.departmentId === a.scopeId;
    case "PROGRAM":
      return a.scopeId !== null && target.programId === a.scopeId;
    case "SELF":
      return target.ownerUserIds?.includes(actor.id) ?? false;
  }
}

/** Without a target any granting assignment suffices; lists are then limited with grantScopesOf. */
export function canOf(
  actor: Actor,
  assignments: readonly Assignment[],
  permission: Permission,
  now: Date,
  target?: TargetScope,
): boolean {
  const granting = grantingAssignments(actor, assignments, permission, now);
  if (target === undefined) return granting.length > 0;
  return granting.some((a) => scopeContains(a, actor, target));
}

/** AC-7: merge all granting assignments into sets a list query can turn into a `where`. */
export function grantScopesOf(
  actor: Actor,
  assignments: readonly Assignment[],
  permission: Permission,
  now: Date,
): GrantScopes {
  const out: GrantScopes = {
    institution: false,
    facultyIds: [],
    departmentIds: [],
    programIds: [],
    self: false,
  };
  for (const a of grantingAssignments(actor, assignments, permission, now)) {
    if (a.scopeType === "INSTITUTION") out.institution = true;
    else if (a.scopeType === "SELF") out.self = true;
    else if (a.scopeId !== null) {
      const list =
        a.scopeType === "FACULTY"
          ? out.facultyIds
          : a.scopeType === "DEPARTMENT"
            ? out.departmentIds
            : out.programIds;
      if (!list.includes(a.scopeId)) list.push(a.scopeId);
    }
  }
  return out;
}

/** AC-10: every permission the actor holds anywhere, for hiding UI. No assignment details. */
export function flattenPermissions(
  actor: Actor,
  assignments: readonly Assignment[],
  all: readonly Permission[],
  now: Date,
): Permission[] {
  return all.filter((p) => grantingAssignments(actor, assignments, p, now).length > 0).sort();
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor(readonly permission: Permission) {
    super(`Forbidden: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** Shape used by server actions (conventions.md) — never throw raw errors to the client. */
export type ForbiddenResult = { ok: false; error: { code: "FORBIDDEN"; message: string } };

export function forbiddenResult(): ForbiddenResult {
  return { ok: false, error: { code: "FORBIDDEN", message: "You are not allowed to do this." } };
}

/** Scope types that must carry a scopeId (used by validation). */
export const needsScopeId = (scopeType: Assignment["scopeType"]): boolean =>
  ID_SCOPES.includes(scopeType);
