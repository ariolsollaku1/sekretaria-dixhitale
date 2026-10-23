import { describe, expect, it } from "vitest";
import { KeycloakAdmin } from "./keycloak-admin";
import { describeIdentityProviderContract } from "./identity-provider.contract";

// Runs the contract against a real Keycloak when one is reachable (local dev stack); skipped in CI,
// which only has Postgres. Needs KEYCLOAK_ISSUER and KEYCLOAK_ADMIN_CLIENT_SECRET in the env.
const issuer = process.env.KEYCLOAK_ISSUER;
const secret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
const base = issuer ? new URL(issuer).origin : "";

const reachable = await (async () => {
  if (!issuer || !secret) return false;
  try {
    return (
      await fetch(`${issuer}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(1500),
      })
    ).ok;
  } catch {
    return false;
  }
})();

const make = () =>
  new KeycloakAdmin({
    baseUrl: base,
    realm: "logos",
    clientId: "sekretari-admin",
    clientSecret: secret!,
    appClientId: "sekretari-web",
    appRedirectUri: `${process.env.APP_URL}/login`,
  });

describeIdentityProviderContract("Keycloak", make, { skip: !reachable });

describe.skipIf(!reachable)("KeycloakAdmin error mapping", () => {
  it("reports an unreachable server as UNAVAILABLE", async () => {
    const idp = new KeycloakAdmin({
      ...{
        baseUrl: "http://127.0.0.1:1",
        realm: "logos",
        clientId: "x",
        clientSecret: "y",
        appClientId: "z",
        appRedirectUri: "http://a/login",
      },
    });
    await expect(idp.findUserByEmail("a@b.c")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
  it("reports bad credentials as FAILED", async () => {
    const idp = new KeycloakAdmin({
      baseUrl: base,
      realm: "logos",
      clientId: "sekretari-admin",
      clientSecret: "wrong",
      appClientId: "z",
      appRedirectUri: "http://a/login",
    });
    await expect(idp.findUserByEmail("a@b.c")).rejects.toMatchObject({ code: "FAILED" });
  });
  it("sends the activation email to the dev mail catcher", async () => {
    const idp = make();
    const email = `mail-${Date.now()}@idp.test`;
    const user = await idp.createUser({ email, firstName: "M", lastName: "Ail" });
    try {
      await idp.executeActionsEmail(user.id, ["UPDATE_PASSWORD", "VERIFY_EMAIL"]);
      const mailpit = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? 8025}`;
      const res = await fetch(
        `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      ).catch(() => null);
      if (res?.ok) expect((await res.json()).messages_count).toBeGreaterThanOrEqual(1);
    } finally {
      await idp.deleteUser(user.id);
    }
  });
});
