import { describe, expect, it } from "vitest";
import { FakeIdentityProvider } from "./fake-identity-provider";
import { describeIdentityProviderContract } from "./identity-provider.contract";
import { IdentityProviderError } from "./identity-provider";

describeIdentityProviderContract("in-memory fake", () => new FakeIdentityProvider());

describe("FakeIdentityProvider helpers", () => {
  it("can be told to fail every call", async () => {
    const idp = new FakeIdentityProvider();
    idp.failWith = new IdentityProviderError("UNAVAILABLE", "down");
    await expect(idp.findUserByEmail("a@b.c")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
  it("seeds IdP-only users and records emails", async () => {
    const idp = new FakeIdentityProvider();
    const seeded = idp.seed({ email: "Only@Idp.test" });
    expect(await idp.findUserByEmail("only@idp.test")).toMatchObject({
      id: seeded.id,
      emailVerified: true,
    });
    await idp.executeActionsEmail(seeded.id, ["VERIFY_EMAIL"]);
    expect(idp.emails).toEqual([{ userId: seeded.id, actions: ["VERIFY_EMAIL"] }]);
  });
});
