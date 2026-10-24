import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatPlainDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { ApplyForm, PublicShell, openOffer } from "@/modules/adm";

export const dynamic = "force-dynamic";

// ADM-02 AC-2: the public application page. No login; with no open cycle there is no form.
export default async function ApplyPage() {
  const [t, locale, offer] = await Promise.all([
    getTranslations("adm.apply"),
    getLocale(),
    openOffer(),
  ]);
  const programs = offer.programs.map((p) => ({
    id: p.id,
    label: `${p.code} · ${locale === "en" && p.nameEn ? p.nameEn : p.name}`,
  }));
  const cycles = offer.cycles.map((c) => ({ id: c.id, label: c.name }));
  // with several open cycles each one carries its own date in the selector
  const closes = offer.cycles.length === 1 ? offer.cycles[0]!.closesOn : undefined;
  return (
    <PublicShell title={t("title")}>
      {cycles.length === 0 ? (
        <p role="status" className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("noCycle")}
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t("intro")}</p>
          {closes && (
            <p className="text-sm font-semibold">
              {t("closesOn", { date: formatPlainDate(closes, locale as Locale) })}
            </p>
          )}
          <ApplyForm cycles={cycles} programs={programs} locale={locale} />
        </>
      )}
      <p className="text-sm">
        {t("haveLink")}{" "}
        <Link href="/apply/link" className="underline">
          {(await getTranslations("adm.link"))("title")}
        </Link>
      </p>
    </PublicShell>
  );
}
