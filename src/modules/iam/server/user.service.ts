import "server-only";
import type { Tx } from "@/lib/db";
import { DomainError, type ActionContext } from "@/lib/actions";
import {
  assignRole as assignRoleRow,
  AssignmentError,
  revokeRole as revokeRoleRow,
} from "@/lib/authz";
import type { Role } from "@/lib/authz/roles";
import {
  canDeactivate,
  canResendActivation,
  canRevokeSysadmin,
  displayName,
  normalizeEmail,
  splitName,
} from "../domain/rules";
import type { CreateUserInput, RoleAssignmentInput, UpdateUserInput } from "../domain/schemas";
import { IdentityProviderError, OTP_GROUP, type IdentityProviderAdmin } from "./identity-provider";

// Orchestration of the app database and the identity provider (auth.md "Account provisioning").
// Every function runs inside the action wrapper's transaction. Calls to the identity provider
// cannot be rolled back with the database, so each registers a compensation (ctx.onFailure).

const KEYCLOAK = "keycloak";

type Ctx = ActionContext;

/** Identity-provider outages become a clean, typed failure; nothing is left half-created. */
export async function idpCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof IdentityProviderError) {
      throw new DomainError(
        error.code === "UNAVAILABLE" ? "UNAVAILABLE" : "CONFLICT",
        error.message,
      );
    }
    if (error instanceof AssignmentError) {
      throw new DomainError("VALIDATION", error.message, { roles: [error.code] });
    }
    throw error;
  }
}

const activeSysadminWhere = (now: Date) => ({
  role: "sysadmin" as Role,
  validFrom: { lte: now },
  OR: [{ validTo: null }, { validTo: { gt: now } }],
});

export async function sysadminFacts(db: Tx, userId: string) {
  const now = new Date();
  const [activeSysadminCount, target] = await Promise.all([
    db.user.count({ where: { active: true, roles: { some: activeSysadminWhere(now) } } }),
    db.user.findUnique({
      where: { id: userId },
      select: { active: true, roles: { where: activeSysadminWhere(now), select: { id: true } } },
    }),
  ]);
  return {
    activeSysadminCount,
    targetIsActiveSysadmin: !!target?.active && (target?.roles.length ?? 0) > 0,
  };
}

async function loadUser(db: Tx, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new DomainError("NOT_FOUND", "User not found");
  return user;
}

/** The user's id in the identity provider: the linked account, else found by email. */
async function idpIdFor(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  user: { id: string; email: string },
): Promise<string> {
  const account = await ctx.db.account.findFirst({
    where: { userId: user.id, providerId: KEYCLOAK },
    select: { accountId: true },
  });
  if (account) return account.accountId;
  const found = await idpCall(() => idp.findUserByEmail(user.email));
  if (!found) throw new DomainError("CONFLICT", "The user has no account in the identity provider");
  return found.id;
}

const summary = (u: { email: string; name: string; active: boolean }) => ({
  email: u.email,
  name: u.name,
  active: u.active,
});
const describeAssignment = (a: { role: string; scopeType: string; scopeId: string | null }) => ({
  role: a.role,
  scopeType: a.scopeType,
  scopeId: a.scopeId,
});

/** AC-2/3/4/9. Returns whether the Keycloak user was newly created (an activation mail follows). */
export async function createUser(ctx: Ctx, idp: IdentityProviderAdmin, input: CreateUserInput) {
  const email = normalizeEmail(input.email);
  if (await ctx.db.user.findUnique({ where: { email } })) {
    throw new DomainError("VALIDATION", "Email already in use", { email: ["emailTaken"] });
  }

  let idpUser = await idpCall(() => idp.findUserByEmail(email));
  let created = false;
  if (idpUser) {
    // AC-3: it exists only in Keycloak. Linking must be confirmed by the caller.
    if (!input.linkExisting) throw new DomainError("CONFLICT", "IDP_USER_EXISTS");
    const linkedElsewhere = await ctx.db.account.findFirst({
      where: { providerId: KEYCLOAK, accountId: idpUser.id },
    });
    if (linkedElsewhere)
      throw new DomainError("VALIDATION", "Identity already linked", { email: ["identityLinked"] });
  } else {
    idpUser = await idpCall(() =>
      idp.createUser({ email, firstName: input.firstName, lastName: input.lastName }),
    );
    created = true;
    const createdId = idpUser.id;
    ctx.onFailure(() => idp.deleteUser(createdId)); // AC-4: compensation
  }
  const idpId = idpUser.id;

  const user = await ctx.db.user.create({
    data: { email, name: displayName(input.firstName, input.lastName), emailVerified: false },
  });
  if (!created) {
    // Linking a pre-existing identity: bind it now so the first login matches by `sub`.
    await ctx.db.account.create({
      data: { userId: user.id, providerId: KEYCLOAK, accountId: idpId },
    });
  }

  const assigned = [];
  for (const assignment of input.roles) {
    assigned.push(await idpCall(() => assignRoleRow(ctx.db, user.id, assignment, ctx.user.id)));
  }
  if (input.roles.some((r) => r.role === "sysadmin")) {
    await idpCall(() => idp.addToGroup(idpId, OTP_GROUP)); // AC-9
    if (!created) ctx.onFailure(() => idp.removeFromGroup(idpId, OTP_GROUP));
  }

  await ctx.audit({
    action: "iam.user.create",
    entityType: "User",
    entityId: user.id,
    before: null,
    after: {
      ...summary(user),
      roles: assigned.map(describeAssignment),
      identity: created ? "created" : "linked",
    },
  });

  if (created) {
    ctx.afterCommit(() => idp.executeActionsEmail(idpId, ["UPDATE_PASSWORD", "VERIFY_EMAIL"]));
  }
  return { userId: user.id, identity: created ? ("created" as const) : ("linked" as const) };
}

/** AC-8 */
export async function updateUser(ctx: Ctx, idp: IdentityProviderAdmin, input: UpdateUserInput) {
  const user = await loadUser(ctx.db, input.userId);
  const email = normalizeEmail(input.email);
  const name = displayName(input.firstName, input.lastName);
  const emailChanged = email !== user.email;
  if (emailChanged && (await ctx.db.user.findUnique({ where: { email } }))) {
    throw new DomainError("VALIDATION", "Email already in use", { email: ["emailTaken"] });
  }
  if (!emailChanged && name === user.name) return { userId: user.id, changed: false };

  const idpId = await idpIdFor(ctx, idp, user);
  const before = splitName(user.name);
  await idpCall(() =>
    idp.updateUser(idpId, { email, firstName: input.firstName, lastName: input.lastName }),
  );
  ctx.onFailure(async () => void (await idp.updateUser(idpId, { email: user.email, ...before })));

  const updated = await ctx.db.user.update({
    where: { id: user.id },
    data: { email, name, ...(emailChanged ? { emailVerified: false } : {}) },
  });
  await ctx.audit({
    action: "iam.user.update",
    entityType: "User",
    entityId: user.id,
    before: summary(user),
    after: summary(updated),
  });
  if (emailChanged) ctx.afterCommit(() => idp.executeActionsEmail(idpId, ["VERIFY_EMAIL"]));
  return { userId: user.id, changed: true };
}

/** AC-6, AC-7 */
export async function deactivateUser(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  userId: string,
  auditAction = "iam.user.deactivate",
) {
  const user = await loadUser(ctx.db, userId);
  if (!user.active) throw new DomainError("CONFLICT", "User is already inactive");
  const rule = canDeactivate({
    actorId: ctx.user.id,
    targetId: userId,
    ...(await sysadminFacts(ctx.db, userId)),
  });
  if (!rule.ok) throw new DomainError("CONFLICT", rule.reason);

  await ctx.db.user.update({ where: { id: userId }, data: { active: false } });
  await ctx.db.session.deleteMany({ where: { userId } });
  const idpId = await idpIdFor(ctx, idp, user);
  await idpCall(() => idp.setEnabled(idpId, false));
  ctx.onFailure(() => idp.setEnabled(idpId, true));
  await idpCall(() => idp.logoutUser(idpId));
  await ctx.audit({
    action: auditAction,
    entityType: "User",
    entityId: userId,
    before: { active: true },
    after: { active: false },
    reason: ctx.reason,
  });
}

export async function reactivateUser(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  userId: string,
  auditAction = "iam.user.reactivate",
) {
  const user = await loadUser(ctx.db, userId);
  if (user.active) throw new DomainError("CONFLICT", "User is already active");
  await ctx.db.user.update({ where: { id: userId }, data: { active: true } });
  const idpId = await idpIdFor(ctx, idp, user);
  await idpCall(() => idp.setEnabled(idpId, true));
  ctx.onFailure(() => idp.setEnabled(idpId, false));
  await ctx.audit({
    action: auditAction,
    entityType: "User",
    entityId: userId,
    before: { active: false },
    after: { active: true },
    reason: ctx.reason,
  });
}

/** AC-5, AC-9 */
export async function addRole(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  userId: string,
  assignment: RoleAssignmentInput,
) {
  const user = await loadUser(ctx.db, userId);
  const row = await idpCall(() => assignRoleRow(ctx.db, userId, assignment, ctx.user.id));
  if (assignment.role === "sysadmin") {
    const idpId = await idpIdFor(ctx, idp, user);
    await idpCall(() => idp.addToGroup(idpId, OTP_GROUP));
    ctx.onFailure(() => idp.removeFromGroup(idpId, OTP_GROUP));
  }
  await ctx.audit({
    action: "iam.user.role_assign",
    entityType: "User",
    entityId: userId,
    before: null,
    after: describeAssignment(row),
  });
  return { assignmentId: row.id };
}

/** AC-5, AC-7, AC-9 */
export async function removeRole(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  userId: string,
  assignmentId: string,
) {
  const user = await loadUser(ctx.db, userId);
  const row = await ctx.db.userRole.findFirst({ where: { id: assignmentId, userId } });
  if (!row) throw new DomainError("NOT_FOUND", "Role assignment not found");

  if (row.role === "sysadmin") {
    const rule = canRevokeSysadmin(await sysadminFacts(ctx.db, userId));
    if (!rule.ok) throw new DomainError("CONFLICT", rule.reason);
  }
  await revokeRoleRow(ctx.db, assignmentId);
  if (
    row.role === "sysadmin" &&
    (await ctx.db.userRole.count({ where: { userId, role: "sysadmin" } })) === 0
  ) {
    const idpId = await idpIdFor(ctx, idp, user);
    await idpCall(() => idp.removeFromGroup(idpId, OTP_GROUP));
    ctx.onFailure(() => idp.addToGroup(idpId, OTP_GROUP));
  }
  await ctx.audit({
    action: "iam.user.role_revoke",
    entityType: "User",
    entityId: userId,
    before: describeAssignment(row),
    after: null,
  });
}

/** AC-10 */
export async function resendActivation(ctx: Ctx, idp: IdentityProviderAdmin, userId: string) {
  const user = await loadUser(ctx.db, userId);
  if (!canResendActivation(user))
    throw new DomainError(
      "CONFLICT",
      "Activation can only be re-sent to users who never signed in",
    );
  const idpId = await idpIdFor(ctx, idp, user);
  await idpCall(() => idp.executeActionsEmail(idpId, ["UPDATE_PASSWORD", "VERIFY_EMAIL"]));
  await ctx.audit({ action: "iam.user.resend_activation", entityType: "User", entityId: userId });
}
