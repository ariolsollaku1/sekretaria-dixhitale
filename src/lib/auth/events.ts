import "server-only";
import { db } from "@/lib/db";
import { createAuditor, getRequestContext } from "@/lib/audit";
import { logger } from "@/lib/logger";

export type AuthEvent =
  | { type: "login.success"; userId: string }
  | { type: "login.denied"; reason: string }
  | { type: "logout"; userId: string };

/**
 * AC-5 (PLT-07): login success, denied login and logout go to the audit trail. Failures to write
 * must never block signing in or out, so they are logged (ids only) and swallowed. Denied logins
 * have no known user, hence actor PUBLIC with the reason code in `after`.
 */
export async function recordAuthEvent(event: AuthEvent): Promise<void> {
  try {
    const request = await getRequestContext();
    const audit =
      event.type === "login.denied"
        ? createAuditor(db, { type: "PUBLIC" }, request)
        : createAuditor(db, { type: "USER", userId: event.userId }, request);
    await audit({
      action:
        event.type === "login.success"
          ? "auth.session.login"
          : event.type === "login.denied"
            ? "auth.session.denied"
            : "auth.session.logout",
      entityType: "Session",
      entityId: event.type === "login.denied" ? null : event.userId,
      after: event.type === "login.denied" ? { reason: event.reason } : null,
    });
  } catch (error) {
    logger.error("auth audit failed", { type: event.type, error: (error as Error).name });
  }
}
