// Pure auth rules (no I/O) so they are unit-tested without a database or Keycloak.

/** AC-3 / AC-4 / AC-8: only an existing, active app user may hold a session. */
export type AccessDecision = { allow: true } | { allow: false; reason: "no-user" | "inactive" };

export function decideAccess(user: { active: boolean } | null | undefined): AccessDecision {
  if (!user) return { allow: false, reason: "no-user" };
  if (!user.active) return { allow: false, reason: "inactive" };
  return { allow: true };
}

export type SessionTimes = { createdAt: Date; expiresAt: Date };

/**
 * AC-6: `expiresAt` is the sliding idle deadline (extended by the library on activity), while
 * `createdAt + maxHours` is the absolute limit.
 */
export function isSessionExpired(session: SessionTimes, now: Date, maxHours: number): boolean {
  if (session.expiresAt.getTime() <= now.getTime()) return true;
  return session.createdAt.getTime() + maxHours * 3_600_000 <= now.getTime();
}

/** Open-redirect protection: only same-origin relative paths survive; anything else becomes "/". */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return "/";
  // "//host" and "/\host" are protocol-relative / browser-normalized to another origin.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(raw)) return "/";
  return raw;
}
