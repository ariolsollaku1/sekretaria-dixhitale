import { getCopy } from "@/lib/auth/copy";
import { recordAuthEvent } from "@/lib/auth/events";
import { endSessionUrl } from "@/lib/auth/keycloak";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // AC-12: a denied sign-in lands here with the library's error code (no personal data in it).
  recordAuthEvent({
    type: "login.denied",
    reason: /^[a-z_]{1,64}$/.test(error ?? "") ? error! : "unknown",
  });

  const t = getCopy().noAccess;
  // AC-4: the way out ends the Keycloak SSO session (Keycloak asks to confirm without a token hint).
  const signOutHref = endSessionUrl({
    issuer: env.KEYCLOAK_ISSUER,
    clientId: env.KEYCLOAK_CLIENT_ID,
    postLogoutRedirectUri: `${env.APP_URL}/login`,
  });
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-sm">{t.body}</p>
      <a href={signOutHref} className="w-full rounded border px-4 py-2 text-center">
        {t.action}
      </a>
    </main>
  );
}
