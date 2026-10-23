// Reasons the login page can explain (keys of auth.reasons in the catalogs).
export const LOGIN_REASONS = ["expired", "signed-out", "unavailable", "error"] as const;
export type LoginReason = (typeof LOGIN_REASONS)[number];

export function isLoginReason(value: string | undefined): value is LoginReason {
  return (LOGIN_REASONS as readonly string[]).includes(value ?? "");
}
