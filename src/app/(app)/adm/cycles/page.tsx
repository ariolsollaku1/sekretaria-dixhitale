import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { formatPlainDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { getLocale } from "next-intl/server";
import { CycleForm, listCycles } from "@/modules/adm";
import { listYearOptions } from "@/modules/org";

// ADM-02 AC-1, AC-12: application cycles and their document lists.
export default async function CyclesPage() {
  const user = await requireUser("/adm/cycles");
  if (!(await can(user, "adm.cycle.read"))) return <ForbiddenView />;
  const [t, locale, cycles, years, mayWrite] = await Promise.all([
    getTranslations("adm.cycles"),
    getLocale(),
    listCycles(),
    listYearOptions(),
    can(user, "adm.cycle.write"),
  ]);
  return (
    <>
      <PageHeader title={t("title")} actions={mayWrite ? <CycleForm years={years} /> : undefined} />
      <p className="text-muted-foreground mb-4 text-sm">{t("intro")}</p>
      <p className="mb-6 text-sm">
        <Link href="/apply" className="underline">
          {t("link")}
        </Link>
      </p>
      {cycles.length === 0 && (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("none")}</p>
      )}
      <div className="flex flex-col gap-4">
        {cycles.map((c) => (
          <section
            key={c.id}
            data-testid={`cycle-${c.name}`}
            className="rounded-card border-border bg-card border p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  {c.name} <span className="text-muted-foreground text-sm">· {c.academicYear}</span>
                </h2>
                <p className="text-muted-foreground text-sm">
                  {formatPlainDate(c.opensOn, locale as Locale)} -{" "}
                  {formatPlainDate(c.closesOn, locale as Locale)} ·{" "}
                  {t("applications", { count: c.applications })}
                </p>
              </div>
              <StatusBadge
                tone={c.open ? "success" : "neutral"}
                label={c.open ? t("open") : t("closed")}
              />
            </div>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {c.documents.map((d) => (
                <li key={d.key}>
                  {locale === "en" && d.labelEn ? d.labelEn : d.labelSq}
                  {!d.required && <span className="text-muted-foreground"> ({t("optional")})</span>}
                </li>
              ))}
            </ul>
            {mayWrite && (
              <div className="mt-4">
                <CycleForm
                  years={years}
                  cycle={{
                    id: c.id,
                    academicYearId: c.academicYearId,
                    name: c.name,
                    opensOn: c.opensOn,
                    closesOn: c.closesOn,
                    active: c.active,
                    documents: c.documents,
                  }}
                />
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
