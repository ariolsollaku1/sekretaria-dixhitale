// Pure URL helpers for Keycloak (kept free of server-only so they are unit-tested).

/** OIDC discovery URL. Inside Docker the back channel uses the internal base URL. */
export function discoveryUrl(issuer: string, internalBaseUrl?: string): string {
  const url = new URL(issuer);
  const base = internalBaseUrl ? new URL(internalBaseUrl).origin : url.origin;
  return `${base}${url.pathname.replace(/\/$/, "")}/.well-known/openid-configuration`;
}

/** AC-7: RP-initiated logout URL (browser-facing). `idToken` is optional for the denied case. */
export function endSessionUrl(args: {
  issuer: string;
  clientId: string;
  postLogoutRedirectUri: string;
  idToken?: string | null;
}): string {
  const url = new URL(`${args.issuer.replace(/\/$/, "")}/protocol/openid-connect/logout`);
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("post_logout_redirect_uri", args.postLogoutRedirectUri);
  if (args.idToken) url.searchParams.set("id_token_hint", args.idToken);
  return url.toString();
}
