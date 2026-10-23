"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { recordAuthEvent } from "./events";
import { endSessionUrl } from "./keycloak";
import { safeCallbackUrl } from "./policy";
import { getCurrentUser } from "./session";
import { getAuth, KEYCLOAK_PROVIDER_ID } from "./server";

/** AC-2: starts the authorization-code + PKCE flow against Keycloak. */
export async function signInAction(formData: FormData): Promise<void> {
  const callbackURL = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""));
  let url: string | undefined;
  try {
    const result = await getAuth().api.signInSocial({
      body: { provider: KEYCLOAK_PROVIDER_ID, callbackURL, errorCallbackURL: "/no-access" },
    });
    url = result.url;
  } catch {
    redirect("/login?reason=unavailable");
  }
  if (!url) redirect("/login?reason=error");
  redirect(url);
}

/** AC-7: deletes the app session, then ends the Keycloak SSO session so credentials are required again. */
export async function signOutAction(): Promise<void> {
  const user = await getCurrentUser();
  let idToken: string | null = null;
  if (user) {
    const account = await db.account.findFirst({
      where: { userId: user.id, providerId: KEYCLOAK_PROVIDER_ID },
      select: { idToken: true },
    });
    idToken = account?.idToken ?? null;
  }
  await getAuth().api.signOut({ headers: await headers() });
  if (user) recordAuthEvent({ type: "logout", userId: user.id });
  redirect(
    endSessionUrl({
      issuer: env.KEYCLOAK_ISSUER,
      clientId: env.KEYCLOAK_CLIENT_ID,
      postLogoutRedirectUri: `${env.APP_URL}/login?reason=signed-out`,
      idToken,
    }),
  );
}
