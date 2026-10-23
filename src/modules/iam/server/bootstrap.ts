import type { Tx } from "@/lib/db";
import { createAuditor } from "@/lib/audit/audit";
import { displayName, normalizeEmail } from "../domain/rules";
import { OTP_GROUP, type IdentityProviderAdmin } from "./identity-provider";

export type BootstrapInput = { email: string; firstName: string; lastName: string };
export type BootstrapResult = {
  userId: string;
  identity: "created" | "linked" | "existing";
  /** True when this run created the sysadmin assignment. */
  roleCreated: boolean;
  activationEmailSent: boolean;
};

/**
 * AC-12: first sysadmin of a fresh installation. Idempotent: running it again changes nothing.
 * Creates (or links) the Keycloak user, the app user and the INSTITUTION sysadmin assignment, and
 * puts the user in the require-otp group. Runs outside a request, so the actor is SYSTEM.
 */
export async function bootstrapAdmin(
  tx: Tx,
  idp: IdentityProviderAdmin,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  const email = normalizeEmail(input.email);
  const audit = createAuditor(tx, { type: "SYSTEM" });

  let idpUser = await idp.findUserByEmail(email);
  let createdIdentity = false;
  if (!idpUser) {
    idpUser = await idp.createUser({ email, firstName: input.firstName, lastName: input.lastName });
    createdIdentity = true;
  }

  let user = await tx.user.findUnique({ where: { email } });
  const createdUser = !user;
  user ??= await tx.user.create({
    data: { email, name: displayName(input.firstName, input.lastName) },
  });
  if (!user.active) user = await tx.user.update({ where: { id: user.id }, data: { active: true } });

  const linked = await tx.account.findFirst({ where: { userId: user.id, providerId: "keycloak" } });
  if (!linked && !createdIdentity) {
    await tx.account.create({
      data: { userId: user.id, providerId: "keycloak", accountId: idpUser.id },
    });
  }

  const existingRole = await tx.userRole.findFirst({
    where: { userId: user.id, role: "sysadmin", scopeType: "INSTITUTION" },
  });
  if (!existingRole)
    await tx.userRole.create({
      data: { userId: user.id, role: "sysadmin", scopeType: "INSTITUTION" },
    });

  await idp.addToGroup(idpUser.id, OTP_GROUP);
  const sendEmail = createdIdentity;
  if (sendEmail) await idp.executeActionsEmail(idpUser.id, ["UPDATE_PASSWORD", "VERIFY_EMAIL"]);

  if (createdUser || !existingRole) {
    await audit({
      action: "iam.user.bootstrap_admin",
      entityType: "User",
      entityId: user.id,
      before: null,
      after: { email, role: "sysadmin", identity: createdIdentity ? "created" : "linked" },
    });
  }
  return {
    userId: user.id,
    identity: createdIdentity ? "created" : linked || !createdUser ? "existing" : "linked",
    roleCreated: !existingRole,
    activationEmailSent: sendEmail,
  };
}
