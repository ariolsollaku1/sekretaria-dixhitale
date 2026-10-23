import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdentityProviderError, OTP_GROUP, type IdentityProviderAdmin } from "./identity-provider";

/**
 * Behaviour every IdentityProviderAdmin must have. Run against the in-memory fake always and
 * against real Keycloak when it is reachable (keycloak-admin.int.test.ts).
 */
export function describeIdentityProviderContract(
  name: string,
  make: () => IdentityProviderAdmin,
  options: { skip?: boolean } = {},
) {
  describe.skipIf(options.skip)(`IdentityProviderAdmin contract: ${name}`, () => {
    let idp: IdentityProviderAdmin;
    const created: string[] = [];
    const email = () => `contract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@idp.test`;

    beforeEach(() => {
      idp = make();
    });
    afterEach(async () => {
      for (const id of created.splice(0)) await idp.deleteUser(id).catch(() => undefined);
    });

    async function newUser(e = email()) {
      const user = await idp.createUser({ email: e, firstName: "Ana", lastName: "Hoxha" });
      created.push(user.id);
      return user;
    }

    it("creates an enabled, unverified user and finds it by email (case-insensitive)", async () => {
      const e = email();
      const user = await newUser(e.toUpperCase());
      expect(user).toMatchObject({
        email: e,
        firstName: "Ana",
        lastName: "Hoxha",
        enabled: true,
        emailVerified: false,
      });
      expect(await idp.findUserByEmail(e)).toMatchObject({ id: user.id });
      expect(await idp.findUserByEmail(email())).toBeNull();
    });

    it("refuses to create a second user with the same email", async () => {
      const e = email();
      await newUser(e);
      await expect(
        idp.createUser({ email: e, firstName: "X", lastName: "Y" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("updates names, and resets emailVerified when the email changes", async () => {
      const user = await newUser();
      const renamed = await idp.updateUser(user.id, { firstName: "Eva", lastName: "Gjika" });
      expect(renamed).toMatchObject({ firstName: "Eva", lastName: "Gjika", email: user.email });
      const e2 = email();
      expect(await idp.updateUser(user.id, { email: e2 })).toMatchObject({
        email: e2,
        emailVerified: false,
      });
      expect(await idp.findUserByEmail(e2)).toMatchObject({ id: user.id });
    });

    it("disables and re-enables a user, and logging out an idle user is harmless", async () => {
      const user = await newUser();
      await idp.setEnabled(user.id, false);
      expect((await idp.findUserByEmail(user.email))?.enabled).toBe(false);
      await idp.setEnabled(user.id, true);
      expect((await idp.findUserByEmail(user.email))?.enabled).toBe(true);
      await expect(idp.logoutUser(user.id)).resolves.toBeUndefined();
    });

    it("adds and removes the require-otp group", async () => {
      const user = await newUser();
      await idp.addToGroup(user.id, OTP_GROUP);
      expect(await idp.listGroups(user.id)).toContain(OTP_GROUP);
      await idp.removeFromGroup(user.id, OTP_GROUP);
      expect(await idp.listGroups(user.id)).not.toContain(OTP_GROUP);
    });

    it("sends the activation email", async () => {
      const user = await newUser();
      await expect(
        idp.executeActionsEmail(user.id, ["UPDATE_PASSWORD", "VERIFY_EMAIL"]),
      ).resolves.toBeUndefined();
    });

    it("deletes users and reports unknown ones as NOT_FOUND", async () => {
      const user = await newUser();
      await idp.deleteUser(user.id);
      created.length = 0;
      expect(await idp.findUserByEmail(user.email)).toBeNull();
      await expect(idp.setEnabled(user.id, false)).rejects.toBeInstanceOf(IdentityProviderError);
      await expect(idp.setEnabled(user.id, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
}
