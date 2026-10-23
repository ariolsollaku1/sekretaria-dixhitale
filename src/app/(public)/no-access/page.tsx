import { ShieldOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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

  const t = await getTranslations("auth.noAccess");
  // AC-4: the way out ends the Keycloak SSO session (Keycloak asks to confirm without a token hint).
  const signOutHref = endSessionUrl({
    issuer: env.KEYCLOAK_ISSUER,
    clientId: env.KEYCLOAK_CLIENT_ID,
    postLogoutRedirectUri: `${env.APP_URL}/login`,
  });
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6"
    >
      <EmptyState
        as="h1"
        icon={ShieldOff}
        title={t("title")}
        description={t("body")}
        action={
          <a href={signOutHref} className={buttonVariants({ variant: "secondary" })}>
            {t("action")}
          </a>
        }
      />
    </main>
  );
}
