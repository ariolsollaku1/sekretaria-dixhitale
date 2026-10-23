import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/lib/authz/permissions";
import { FakeIdentityProvider } from "./fake-identity-provider";
import { IdentityProviderError, OTP_GROUP } from "./identity-provider";
import * as users from "./user.service";

let idp: FakeIdentityProvider;
let actor: { id: string; email: string; name: string; locale: null; personId: null };

/** Runs `fn` the way a server action would: transaction, audit, compensation and commit hooks. */
function run<R>(fn: (ctx: ActionContext) => Promise<R>, reason?: string): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "iam.user.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}

const base = { firstName: "Ana", lastName: "Hoxha", linkExisting: false };
const secretary = { role: "secretary", scopeType: "INSTITUTION" } as const;

async function makeActor() {
  const u = await db.user.create({ data: { email: "root@t.test", name: "Root" } });
  await db.userRole.create({ data: { userId: u.id, role: "sysadmin", scopeType: "INSTITUTION" } });
  return { id: u.id, email: u.email, name: u.name, locale: null, personId: null } as const;
}

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"');
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.userRole.deleteMany();
  await db.user.deleteMany();
  idp = new FakeIdentityProvider();
  actor = { ...(await makeActor()) };
});

describe("createUser (AC-2, AC-3, AC-4, AC-9)", () => {
  it("creates the identity, the app user and roles, audits it, and mails the activation link after commit", async () => {
    const result = await run((ctx) =>
      users.createUser(ctx, idp, { ...base, email: "Ana@Logos.test", roles: [secretary] }),
    );
    expect(result).toMatchObject({ ok: true, data: { identity: "created" } });

    const user = await db.user.findUniqueOrThrow({
      where: { email: "ana@logos.test" },
      include: { roles: true },
    });
    expect(user).toMatchObject({ name: "Ana Hoxha", active: true, emailVerified: false });
    expect(user.roles).toMatchObject([
      { role: "secretary", scopeType: "INSTITUTION", createdById: actor.id },
    ]);

    const idpUser = await idp.findUserByEmail("ana@logos.test");
    expect(idpUser).toMatchObject({ enabled: true, emailVerified: false });
    expect(idp.emails).toEqual([
      { userId: idpUser!.id, actions: ["UPDATE_PASSWORD", "VERIFY_EMAIL"] },
    ]);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "iam.user.create" } });
    expect(audit).toMatchObject({ entityId: user.id, actorUserId: actor.id });
    expect(audit.after).toMatchObject({
      email: "ana@logos.test",
      identity: "created",
      roles: [{ role: "secretary" }],
    });
  });

  it("deletes the identity again when the database part fails (AC-4)", async () => {
    // A student may only have SELF scope: assignRole rejects this after the IdP user exists.
    const result = await run((ctx) =>
      users.createUser(ctx, idp, {
        ...base,
        email: "bad@logos.test",
        roles: [{ role: "student", scopeType: "INSTITUTION" }],
      }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await idp.findUserByEmail("bad@logos.test")).toBeNull();
    expect(idp.emails).toEqual([]);
    expect(await db.user.count({ where: { email: "bad@logos.test" } })).toBe(0);
  });

  it("refuses an email that already exists in the app, with a field error (AC-3)", async () => {
    await run((ctx) =>
      users.createUser(ctx, idp, { ...base, email: "dup@logos.test", roles: [secretary] }),
    );
    const again = await run((ctx) =>
      users.createUser(ctx, idp, { ...base, email: "DUP@logos.test", roles: [secretary] }),
    );
    expect(again).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { email: ["emailTaken"] } },
    });
  });

  it("offers to link an identity that exists only in Keycloak, and links it when confirmed (AC-3)", async () => {
    const existing = idp.seed({ email: "idp-only@logos.test" });
    const offer = await run((ctx) =>
      users.createUser(ctx, idp, { ...base, email: "idp-only@logos.test", roles: [secretary] }),
    );
    expect(offer).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "IDP_USER_EXISTS" },
    });
    expect(await db.user.count({ where: { email: "idp-only@logos.test" } })).toBe(0);

    const linked = await run((ctx) =>
      users.createUser(ctx, idp, {
        ...base,
        email: "idp-only@logos.test",
        roles: [secretary],
        linkExisting: true,
      }),
    );
    expect(linked).toMatchObject({ ok: true, data: { identity: "linked" } });
    const user = await db.user.findUniqueOrThrow({
      where: { email: "idp-only@logos.test" },
      include: { accounts: true },
    });
    expect(user.accounts).toMatchObject([{ providerId: "keycloak", accountId: existing.id }]);
    expect(idp.emails).toEqual([]); // the person already has a password
    expect(idp.users.size).toBe(1); // nothing new created
  });

  it("refuses to link an identity that already belongs to another app user", async () => {
    const existing = idp.seed({ email: "taken@logos.test" });
    const other = await db.user.create({ data: { email: "someone@logos.test", name: "Someone" } });
    await db.account.create({
      data: { userId: other.id, providerId: "keycloak", accountId: existing.id },
    });
    const result = await run((ctx) =>
      users.createUser(ctx, idp, {
        ...base,
        email: "taken@logos.test",
        roles: [secretary],
        linkExisting: true,
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { email: ["identityLinked"] } },
    });
  });

  it("puts new sysadmins into the require-otp group (AC-9)", async () => {
    await run((ctx) =>
      users.createUser(ctx, idp, {
        ...base,
        email: "boss@logos.test",
        roles: [{ role: "sysadmin", scopeType: "INSTITUTION" }],
      }),
    );
    const id = (await idp.findUserByEmail("boss@logos.test"))!.id;
    expect(await idp.listGroups(id)).toEqual([OTP_GROUP]);
  });

  it("fails cleanly when the identity service is down: nothing is created", async () => {
    idp.failWith = new IdentityProviderError("UNAVAILABLE", "Identity service unavailable");
    const result = await run((ctx) =>
      users.createUser(ctx, idp, { ...base, email: "down@logos.test", roles: [secretary] }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "UNAVAILABLE" } });
    expect(await db.user.count({ where: { email: "down@logos.test" } })).toBe(0);
  });
});

async function seedUser(
  email = "p@logos.test",
  roles: (typeof secretary | { role: "sysadmin"; scopeType: "INSTITUTION" })[] = [secretary],
) {
  await run((ctx) => users.createUser(ctx, idp, { ...base, email, roles }));
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const idpId = (await idp.findUserByEmail(email))!.id;
  return { user, idpId };
}

describe("deactivate / reactivate (AC-6, AC-7)", () => {
  it("deactivates: flag, sessions, identity disabled and logged out, reason audited", async () => {
    const { user, idpId } = await seedUser();
    await db.session.create({
      data: { token: "t1", userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    idp.users.get(idpId)!.sessions = 2;

    expect(
      await run((ctx) => users.deactivateUser(ctx, idp, user.id), "left the college"),
    ).toMatchObject({ ok: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).active).toBe(false);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(idp.users.get(idpId)).toMatchObject({ enabled: false, sessions: 0 });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "iam.user.deactivate" } }),
    ).toMatchObject({
      reason: "left the college",
      before: { active: true },
      after: { active: false },
    });
  });

  it("re-enables on reactivation and rejects repeated transitions", async () => {
    const { user, idpId } = await seedUser();
    await run((ctx) => users.deactivateUser(ctx, idp, user.id), "x");
    expect(await run((ctx) => users.deactivateUser(ctx, idp, user.id), "x")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await run((ctx) => users.reactivateUser(ctx, idp, user.id), "back")).toMatchObject({
      ok: true,
    });
    expect(idp.users.get(idpId)!.enabled).toBe(true);
    expect(await run((ctx) => users.reactivateUser(ctx, idp, user.id), "again")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("refuses to deactivate yourself and the last active sysadmin (AC-7)", async () => {
    expect(await run((ctx) => users.deactivateUser(ctx, idp, actor.id), "x")).toMatchObject({
      ok: false,
      error: { message: "SELF_DEACTIVATION" },
    });
    const { user: other } = await seedUser("admin2@logos.test", [
      { role: "sysadmin", scopeType: "INSTITUTION" },
    ]);
    // two sysadmins: deactivating the other one is fine ...
    await db.user.update({ where: { id: actor.id }, data: { active: true } });
    expect(await run((ctx) => users.deactivateUser(ctx, idp, other.id), "x")).toMatchObject({
      ok: true,
    });
    // ... but now the actor is the last one; the rule also protects when somebody else is the actor.
    actor = { ...actor, id: other.id };
    const rootId = (await db.user.findUniqueOrThrow({ where: { email: "root@t.test" } })).id;
    expect(await run((ctx) => users.deactivateUser(ctx, idp, rootId), "x")).toMatchObject({
      ok: false,
      error: { message: "LAST_SYSADMIN" },
    });
  });

  it("rolls the database back and re-enables the identity if a later step fails", async () => {
    const { user, idpId } = await seedUser();
    const failing = new FakeIdentityProvider();
    failing.users.set(idpId, { ...idp.users.get(idpId)! });
    failing.logoutUser = async () => {
      throw new IdentityProviderError("UNAVAILABLE", "down");
    };
    expect(await run((ctx) => users.deactivateUser(ctx, failing, user.id), "x")).toMatchObject({
      ok: false,
      error: { code: "UNAVAILABLE" },
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).active).toBe(true);
    expect(failing.users.get(idpId)!.enabled).toBe(true);
  });
});

describe("updateUser (AC-8)", () => {
  it("updates the name in both systems without touching verification", async () => {
    const { user, idpId } = await seedUser();
    await run((ctx) =>
      users.updateUser(ctx, idp, {
        userId: user.id,
        email: user.email,
        firstName: "Eva",
        lastName: "Gjika",
      }),
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("Eva Gjika");
    expect(idp.users.get(idpId)).toMatchObject({ firstName: "Eva", lastName: "Gjika" });
    expect(
      idp.emails.filter((e) => e.actions.includes("VERIFY_EMAIL") && e.actions.length === 1),
    ).toEqual([]);
  });

  it("an email change resets verification and re-sends VERIFY_EMAIL", async () => {
    const { user, idpId } = await seedUser();
    await db.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    idp.emails.length = 0;
    const result = await run((ctx) =>
      users.updateUser(ctx, idp, {
        userId: user.id,
        email: "new@logos.test",
        firstName: "Ana",
        lastName: "Hoxha",
      }),
    );
    expect(result).toMatchObject({ ok: true, data: { changed: true } });
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      email: "new@logos.test",
      emailVerified: false,
    });
    expect(idp.users.get(idpId)).toMatchObject({ email: "new@logos.test", emailVerified: false });
    expect(idp.emails).toEqual([{ userId: idpId, actions: ["VERIFY_EMAIL"] }]);
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "iam.user.update" } }),
    ).toMatchObject({
      before: { email: "p@logos.test" },
      after: { email: "new@logos.test" },
    });
  });

  it("is a no-op without changes, and refuses an email used by someone else", async () => {
    const { user } = await seedUser();
    expect(
      await run((ctx) =>
        users.updateUser(ctx, idp, {
          userId: user.id,
          email: user.email,
          firstName: "Ana",
          lastName: "Hoxha",
        }),
      ),
    ).toMatchObject({ ok: true, data: { changed: false } });
    expect(await db.auditLog.count({ where: { action: "iam.user.update" } })).toBe(0);
    expect(
      await run((ctx) =>
        users.updateUser(ctx, idp, {
          userId: user.id,
          email: "root@t.test",
          firstName: "Ana",
          lastName: "Hoxha",
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: { email: ["emailTaken"] } },
    });
  });

  it("reports an unknown user", async () => {
    expect(
      await run((ctx) =>
        users.updateUser(ctx, idp, {
          userId: "nope",
          email: "a@b.test",
          firstName: "A",
          lastName: "B",
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("roles (AC-5, AC-7, AC-9)", () => {
  it("adds and removes assignments, validated and audited", async () => {
    const { user } = await seedUser();
    const added = await run((ctx) =>
      users.addRole(ctx, idp, user.id, { role: "finance", scopeType: "INSTITUTION" }),
    );
    expect(added).toMatchObject({ ok: true });
    expect(
      await run((ctx) =>
        users.addRole(ctx, idp, user.id, { role: "finance", scopeType: "INSTITUTION" }),
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await run((ctx) =>
        users.addRole(ctx, idp, user.id, {
          role: "head_of_department",
          scopeType: "DEPARTMENT",
          scopeId: "d1",
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: { roles: ["NO_RESOLVER"] } },
    });

    const id = added.ok ? added.data.assignmentId : "";
    expect(await run((ctx) => users.removeRole(ctx, idp, user.id, id))).toMatchObject({ ok: true });
    expect(await db.userRole.count({ where: { userId: user.id } })).toBe(1);
    expect(
      (
        await db.auditLog.findMany({
          where: { action: { startsWith: "iam.user.role_" } },
          orderBy: { at: "asc" },
        })
      ).map((a) => a.action),
    ).toEqual(["iam.user.role_assign", "iam.user.role_revoke"]);
    expect(await run((ctx) => users.removeRole(ctx, idp, user.id, "missing"))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("toggles the require-otp group with the sysadmin role, and keeps the last sysadmin", async () => {
    const { user, idpId } = await seedUser();
    const added = await run((ctx) =>
      users.addRole(ctx, idp, user.id, { role: "sysadmin", scopeType: "INSTITUTION" }),
    );
    expect(await idp.listGroups(idpId)).toEqual([OTP_GROUP]);
    const id = added.ok ? added.data.assignmentId : "";
    expect(await run((ctx) => users.removeRole(ctx, idp, user.id, id))).toMatchObject({ ok: true });
    expect(await idp.listGroups(idpId)).toEqual([]);

    const rootRole = await db.userRole.findFirstOrThrow({ where: { userId: actor.id } });
    const other = await seedUser("o@logos.test");
    actor = { ...actor, id: other.user.id };
    expect(
      await run((ctx) => users.removeRole(ctx, idp, rootRole.userId, rootRole.id)),
    ).toMatchObject({ ok: false, error: { message: "LAST_SYSADMIN" } });
  });
});

describe("resendActivation (AC-10)", () => {
  it("re-sends only to users who never logged in", async () => {
    const { user, idpId } = await seedUser();
    idp.emails.length = 0;
    expect(await run((ctx) => users.resendActivation(ctx, idp, user.id))).toMatchObject({
      ok: true,
    });
    expect(idp.emails).toEqual([{ userId: idpId, actions: ["UPDATE_PASSWORD", "VERIFY_EMAIL"] }]);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    expect(await run((ctx) => users.resendActivation(ctx, idp, user.id))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });
});
