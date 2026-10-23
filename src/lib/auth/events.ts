import "server-only";

export type AuthEvent =
  | { type: "login.success"; userId: string }
  | { type: "login.denied"; reason: string }
  | { type: "logout"; userId: string };

/**
 * AC-12: structured server log, ids and reason codes only (no email, no name). PLT-07 replaces the
 * body with an AuditLog write; callers stay unchanged.
 */
export function recordAuthEvent(event: AuthEvent): void {
  console.info(
    JSON.stringify({ level: "info", msg: "auth", ...event, at: new Date().toISOString() }),
  );
}
