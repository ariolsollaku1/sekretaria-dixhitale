import { beforeEach, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bootstrapAdmin } from "./bootstrap";
import { FakeIdentityProvider } from "./fake-identity-provider";
import { OTP_GROUP } from "./identity-provider";

const input = { email: "First@Logos.test", firstName: "First", lastName: "Admin" };

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"');
  await db.account.deleteMany();
  await db.userRole.deleteMany();
  await db.user.deleteMany();
});

it("creates the first sysadmin, and running it twice changes nothing (AC-12)", async () => {
  const idp = new FakeIdentityProvider();
  const first = await db.$transaction((tx) => bootstrapAdmin(tx, idp, input));
  const second = await db.$transaction((tx) => bootstrapAdmin(tx, idp, input));

  expect(first).toMatchObject({
    identity: "created",
    roleCreated: true,
    activationEmailSent: true,
  });
  expect(second).toMatchObject({
    identity: "existing",
    roleCreated: false,
    activationEmailSent: false,
  });
  expect(second.userId).toBe(first.userId);

  expect(await db.user.count()).toBe(1);
  expect(await db.userRole.findMany()).toMatchObject([
    { role: "sysadmin", scopeType: "INSTITUTION", scopeId: null },
  ]);
  expect(idp.users.size).toBe(1);
  expect(idp.emails).toHaveLength(1);
  const idpId = [...idp.users.keys()][0]!;
  expect(await idp.listGroups(idpId)).toEqual([OTP_GROUP]);
  expect(await db.auditLog.count({ where: { action: "iam.user.bootstrap_admin" } })).toBe(1);
  expect(await db.auditLog.findFirstOrThrow()).toMatchObject({ actorType: "SYSTEM" });
});

it("links an identity that already exists in Keycloak instead of creating a second one", async () => {
  const idp = new FakeIdentityProvider();
  const seeded = idp.seed({ email: "first@logos.test" });
  const result = await db.$transaction((tx) => bootstrapAdmin(tx, idp, input));
  expect(result).toMatchObject({ identity: "linked", activationEmailSent: false });
  expect(idp.users.size).toBe(1);
  expect(await db.account.findMany()).toMatchObject([
    { providerId: "keycloak", accountId: seeded.id },
  ]);
});

it("reactivates and keeps an existing app user", async () => {
  const idp = new FakeIdentityProvider();
  await db.user.create({ data: { email: "first@logos.test", name: "Old Name", active: false } });
  await db.$transaction((tx) => bootstrapAdmin(tx, idp, input));
  expect(await db.user.findMany()).toMatchObject([{ name: "Old Name", active: true }]);
});
