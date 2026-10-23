import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decideAccess, isSessionExpired } from "./policy";
import { getAuth } from "./server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  locale: string | null;
  personId: string | null;
};

/**
 * The signed-in user, or null. Re-reads the user row every request so deactivation (AC-8) and the
 * absolute session limit (AC-6) take effect immediately. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const requestHeaders = await headers();
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result) return null;

  const { session } = result;
  const user = await db.user.findUnique({ where: { id: session.userId } });
  const access = decideAccess(user);
  const expired = isSessionExpired(
    { createdAt: new Date(session.createdAt), expiresAt: new Date(session.expiresAt) },
    new Date(),
    env.SESSION_MAX_HOURS,
  );
  if (!user || !access.allow || expired) {
    // Stale session: remove it so it cannot be replayed. Cookies cannot be written while rendering.
    await db.session.deleteMany({ where: { token: session.token } });
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    personId: user.personId,
  };
});

/** For server components, actions and route handlers: redirects to /login when signed out (AC-1). */
export async function requireUser(callbackUrl = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return user;
}
