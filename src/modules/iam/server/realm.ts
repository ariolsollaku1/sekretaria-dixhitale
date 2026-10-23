/** The realm name is the last path segment of the issuer, e.g. .../realms/logos. */
export function realmFromIssuer(issuer: string): string {
  return new URL(issuer).pathname.split("/").filter(Boolean).pop() ?? "logos";
}
