import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { recordAuthEvent } from "./events";
import { discoveryUrl } from "./keycloak";
import { decideAccess } from "./policy";

export const KEYCLOAK_PROVIDER_ID = "keycloak";

function createAuth() {
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(db, { provider: "postgresql" }),
    // Keycloak owns credentials (ADR-0004): no local passwords, no social providers.
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        active: { type: "boolean", required: false, defaultValue: true, input: false },
        personId: { type: "string", required: false, input: false },
        locale: { type: "string", required: false, input: false },
        lastLoginAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      // Sliding idle window: the library pushes expiresAt forward at most once per updateAge.
      // The absolute limit (SESSION_MAX_HOURS) is enforced in session.ts. No cookie cache, so a
      // deactivated user is rejected on the very next request (AC-8).
      expiresIn: env.SESSION_IDLE_MINUTES * 60,
      updateAge: 60,
    },
    account: {
      // First login links the Keycloak `sub` to the pre-created User by *Keycloak-verified* email
      // (the provider is deliberately not in trustedProviders, so email_verified is required).
      // App users created by an admin have no verified flag yet, hence requireLocalEmailVerified.
      accountLinking: { enabled: true, requireLocalEmailVerified: false },
      encryptOAuthTokens: true,
    },
    advanced: {
      useSecureCookies: env.APP_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { active: true },
            });
            const decision = decideAccess(user);
            if (!decision.allow) {
              recordAuthEvent({ type: "login.denied", reason: decision.reason });
              throw new APIError("FORBIDDEN", {
                code: "account_inactive",
                message: "Account is not active",
              });
            }
          },
          after: async (session) => {
            await db.user.update({
              where: { id: session.userId },
              data: { lastLoginAt: new Date() },
            });
            recordAuthEvent({ type: "login.success", userId: session.userId });
          },
        },
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: KEYCLOAK_PROVIDER_ID,
            discoveryUrl: discoveryUrl(env.KEYCLOAK_ISSUER, env.KEYCLOAK_INTERNAL_URL),
            clientId: env.KEYCLOAK_CLIENT_ID,
            clientSecret: env.KEYCLOAK_CLIENT_SECRET,
            scopes: ["openid", "email", "profile"],
            pkce: true, // S256, matches the realm client's pkce.code.challenge.method
            disableSignUp: true, // no implicit sign-up: only pre-created users may sign in (Q-19)
            requireEmailVerification: true,
            overrideUserInfo: false,
          },
        ],
      }),
      nextCookies(), // must stay last: lets server actions set the session cookie
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { auth?: Auth };

/** Lazily created: building needs env and (for discovery) Keycloak, which `next build` lacks. */
export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
