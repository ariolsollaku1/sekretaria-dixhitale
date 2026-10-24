import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LinkRequestForm, PublicShell } from "@/modules/adm";

export const dynamic = "force-dynamic";

// ADM-02 AC-10: ask for a new private link with reference + e-mail.
export default async function LinkPage() {
  const t = await getTranslations("adm.link");
  return (
    <PublicShell title={t("title")}>
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      <LinkRequestForm />
      <p className="text-sm">
        <Link href="/apply" className="underline">
          {t("back")}
        </Link>
      </p>
    </PublicShell>
  );
}
