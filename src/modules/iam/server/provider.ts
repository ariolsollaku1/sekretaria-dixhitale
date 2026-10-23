import "server-only";
import { env } from "@/lib/env";
import { KeycloakAdmin } from "./keycloak-admin";
import type { IdentityProviderAdmin } from "./identity-provider";
import { realmFromIssuer } from "./realm";

let instance: IdentityProviderAdmin | undefined;

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
