import "server-only";
import { env } from "@/lib/env";
import { KeycloakAdmin } from "./keycloak-admin";
import type { IdentityProviderAdmin } from "./identity-provider";

let instance: IdentityProviderAdmin | undefined;

/** The realm name is the last path segment of the issuer, e.g. .../realms/logos. */
export function realmFromIssuer(issuer: string): string {
  return new URL(issuer).pathname.split("/").filter(Boolean).pop() ?? "logos";
}

/** Production identity provider; overridden in tests through `setIdentityProvider`. */
export function getIdentityProvider(): IdentityProviderAdmin {
  instance ??= new KeycloakAdmin({
    baseUrl: env.KEYCLOAK_INTERNAL_URL ?? new URL(env.KEYCLOAK_ISSUER).origin,
    realm: realmFromIssuer(env.KEYCLOAK_ISSUER),
    clientId: env.KEYCLOAK_ADMIN_CLIENT_ID,
    clientSecret: env.KEYCLOAK_ADMIN_CLIENT_SECRET,
    appClientId: env.KEYCLOAK_CLIENT_ID,
    appRedirectUri: `${env.APP_URL}/login`,
  });
  return instance;
}

export function setIdentityProvider(idp: IdentityProviderAdmin | undefined): void {
  instance = idp;
}
