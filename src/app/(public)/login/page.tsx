import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { signInAction } from "@/lib/auth/actions";
import { safeCallbackUrl } from "@/lib/auth/policy";
import { isLoginReason } from "@/lib/auth/reasons";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reason?: string }>;
}) {
  const { callbackUrl, reason } = await searchParams;
  const t = await getTranslations();
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8"
    >
      <header>
        <h1 className="text-[32px] leading-tight font-semibold">{t("shell.appName")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("shell.institution")}</p>
      </header>
      {isLoginReason(reason) && (
        <p role="status" className="rounded-control border-border bg-card border p-3 text-sm">
          {t(`auth.reasons.${reason}`)}
        </p>
      )}
      <form action={signInAction}>
        <input type="hidden" name="callbackUrl" value={safeCallbackUrl(callbackUrl)} />
        <Button type="submit" className="w-full">
          {t("auth.signIn")}
        </Button>
      </form>
    </main>
  );
}
