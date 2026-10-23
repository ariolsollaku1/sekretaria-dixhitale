import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";
import { MakeCurrentButton, YearForm, getCurrentAcademicYear, getYear } from "@/modules/org";

const TONE: Record<string, StatusTone> = { CURRENT: "success", PLANNED: "info", CLOSED: "neutral" };

export default async function YearDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/org/years/${id}`);
  if (!(await can(user, "org.year.read"))) return <ForbiddenView />;

  const year = await getYear(id);
  if (!year) notFound();
  const [t, locale, mayWrite, current] = await Promise.all([
    getTranslations("org"),
    getLocale(),
    can(user, "org.year.write"),
    getCurrentAcademicYear(),
  ]);
  const l = locale as Locale;
  const day = (d: string) => formatPlainDate(d, l);

  return (
    <>
      <PageHeader
        title={year.code}
        breadcrumbs={[{ label: t("title"), href: "/org/years" }, { label: year.code }]}
        actions={
          mayWrite &&
          year.status === "PLANNED" && (
            <MakeCurrentButton
              yearId={year.id}
              code={year.code}
              previousCode={current?.code ?? null}
            />
          )
        }
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={TONE[year.status]!} label={t(`status.${year.status}`)} />
        <span className="font-tabular">
          {day(year.startDate)} – {day(year.endDate)}
        </span>
      </p>
      {year.status === "CLOSED" && (
        <p className="rounded-control border-border bg-muted mb-6 border p-3 text-sm">
          {t("detail.closedNote")}
        </p>
      )}
      {!current && year.status === "PLANNED" && (
        <p
          role="status"
          className="rounded-control border-info/40 bg-info-bg mb-6 border p-3 text-sm"
        >
          {t("detail.noCurrent")}
        </p>
      )}

      <section aria-labelledby="semesters-title" className="mb-8">
        <h2 id="semesters-title" className="mb-3 text-2xl font-semibold">
          {t("detail.semesters")}
        </h2>
        <ul className="flex flex-col gap-2">
          {year.semesters.map((s) => (
            <li key={s.number} className="rounded-control border-border bg-card border px-3 py-2">
              <span className="font-semibold">{t("detail.semester", { number: s.number })}</span>
              <span className="font-tabular text-muted-foreground text-sm">
                {" "}
                · {day(s.startDate)} – {day(s.endDate)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {mayWrite && year.status !== "CLOSED" && (
        <section aria-labelledby="edit-title" className="mb-8">
          <h2 id="edit-title" className="mb-3 text-2xl font-semibold">
            {t("detail.edit")}
          </h2>
          <YearForm
            mode="edit"
            yearId={year.id}
            defaults={{
              startDate: year.startDate,
              endDate: year.endDate,
              semester1: { start: year.semesters[0]!.startDate, end: year.semesters[0]!.endDate },
              semester2: { start: year.semesters[1]!.startDate, end: year.semesters[1]!.endDate },
            }}
          />
        </section>
      )}

      <EntityHistory entityType="AcademicYear" entityId={year.id} permission="org.year.read" />
    </>
  );
}
