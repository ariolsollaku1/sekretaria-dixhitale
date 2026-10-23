import "server-only";
import { requireUser } from "@/lib/auth";
import { ForbiddenError, canOf, flattenPermissions, grantScopesOf } from "./check";
import { loadActorContext } from "./load";
import { allPermissions, getScopeResolver, resolveTarget } from "./registry";
import "./permissions";
import type { GrantScopes, Permission, Target, TargetScope } from "./types";

type UserRef = { id: string };

/** Fills in missing ancestors from the registered scope resolvers (program -> department -> faculty). */
export async function expandTargetScope(scope: TargetScope): Promise<TargetScope> {
  const out = { ...scope };
  if (out.programId && !(out.departmentId && out.facultyId)) {
    const up = await getScopeResolver("PROGRAM")?.ancestors(out.programId);
    out.departmentId ??= up?.departmentId;
    out.facultyId ??= up?.facultyId;
  }
  if (out.departmentId && !out.facultyId) {
    const up = await getScopeResolver("DEPARTMENT")?.ancestors(out.departmentId);
    out.facultyId ??= up?.facultyId;
  }
  return out;
}

/** AC-4/AC-5. A target that cannot be resolved is denied. */
export async function can(
  user: UserRef,
  permission: Permission,
  target?: Target,
): Promise<boolean> {
  const ctx = await loadActorContext(user.id);
  if (!ctx) return false;
  let scope: TargetScope | undefined;
  if (target) {
    const resolved = await resolveTarget(target);
    if (!resolved) return false;
    scope = await expandTargetScope(resolved);
  }
  return canOf(ctx.actor, ctx.assignments, permission, new Date(), scope);
}

/** Throws ForbiddenError unless allowed. */
export async function assertCan(
  user: UserRef,
  permission: Permission,
  target?: Target,
): Promise<void> {
  if (!(await can(user, permission, target))) throw new ForbiddenError(permission);
}

/**
 * Signed-in user + permission check in one call (AC-6). Pages: catch ForbiddenError, or test `can`
 * and render <ForbiddenView/>. Server actions: map with `actionErrorFrom` (errors.ts).
 */
export async function requirePermission(permission: Permission, target?: Target) {
  const user = await requireUser();
  await assertCan(user, permission, target);
  return user;
}

/** AC-7: build list-query `where` clauses from this. */
export async function grantScopes(user: UserRef, permission: Permission): Promise<GrantScopes> {
  const ctx = await loadActorContext(user.id);
  const none: GrantScopes = {
    institution: false,
    facultyIds: [],
    departmentIds: [],
    programIds: [],
    self: false,
  };
  return ctx ? grantScopesOf(ctx.actor, ctx.assignments, permission, new Date()) : none;
}

/** AC-10: flat permission strings for the client; never the assignments. */
export async function permissionsFor(user: UserRef): Promise<Permission[]> {
  const ctx = await loadActorContext(user.id);
  return ctx ? flattenPermissions(ctx.actor, ctx.assignments, allPermissions(), new Date()) : [];
}
