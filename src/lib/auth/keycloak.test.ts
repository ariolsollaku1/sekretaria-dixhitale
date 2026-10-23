import { describe, expect, it } from "vitest";
import { discoveryUrl, endSessionUrl } from "./keycloak";

describe("discoveryUrl", () => {
  it("uses the issuer when no internal URL is set", () => {
    expect(discoveryUrl("http://localhost:8080/realms/logos")).toBe(
      "http://localhost:8080/realms/logos/.well-known/openid-configuration",
    );
  });
  it("swaps the origin for the internal URL, keeping the realm path", () => {
    expect(discoveryUrl("https://auth.logos.test/realms/logos/", "http://keycloak:8080")).toBe(
      "http://keycloak:8080/realms/logos/.well-known/openid-configuration",
    );
  });
});

describe("endSessionUrl (AC-7)", () => {
  it("carries id_token_hint and post_logout_redirect_uri", () => {
    const url = new URL(
      endSessionUrl({
        issuer: "http://localhost:8080/realms/logos",
        clientId: "sekretari-web",
        postLogoutRedirectUri: "http://localhost:3100/login",
        idToken: "abc.def.ghi",
      }),
    );
    expect(url.pathname).toBe("/realms/logos/protocol/openid-connect/logout");
    expect(url.searchParams.get("id_token_hint")).toBe("abc.def.ghi");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("http://localhost:3100/login");
    expect(url.searchParams.get("client_id")).toBe("sekretari-web");
  });
  it("omits id_token_hint when unknown", () => {
    const url = new URL(
      endSessionUrl({
        issuer: "http://k/realms/logos",
        clientId: "c",
        postLogoutRedirectUri: "http://a/login",
      }),
    );
    expect(url.searchParams.has("id_token_hint")).toBe(false);
  });
});
