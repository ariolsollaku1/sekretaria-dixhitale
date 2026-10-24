import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { CalendarDays, Pencil } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
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
  const [t, tc, locale, mayWrite, current] = await Promise.all([
    getTranslations("org"),
    getTranslations("common"),
    getLocale(),
    can(user, "org.year.write"),
    getCurrentAcademicYear(),
  ]);
  const l = locale as Locale;
  const day = (d: string) => formatPlainDate(d, l);

  return (
    <>
      <RecordHero
        icon={CalendarDays}
        name={year.code}
        subtitle={`${day(year.startDate)} – ${day(year.endDate)}`}
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
        badges={<StatusBadge tone={TONE[year.status]!} label={t(`status.${year.status}`)} />}
      />
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="semesters-title">
            <CardTitle id="semesters-title" icon={CalendarDays}>
              {t("detail.semesters")}
            </CardTitle>
            <ul className="divide-border flex flex-col divide-y">
              {year.semesters.map((s) => (
                <li key={s.number} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-semibold">{t("detail.semester", { number: s.number })}</p>
                  <p className="font-tabular text-muted-foreground text-sm">
                    {day(s.startDate)} – {day(s.endDate)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          {mayWrite && year.status !== "CLOSED" && (
            <Card aria-labelledby="edit-title">
              <CardTitle id="edit-title" icon={Pencil}>
                {t("detail.edit")}
              </CardTitle>
              <YearForm
                mode="edit"
                yearId={year.id}
                defaults={{
                  startDate: year.startDate,
                  endDate: year.endDate,
                  semester1: {
                    start: year.semesters[0]!.startDate,
                    end: year.semesters[0]!.endDate,
                  },
                  semester2: {
                    start: year.semesters[1]!.startDate,
                    end: year.semesters[1]!.endDate,
                  },
                }}
              />
            </Card>
          )}
        </div>
        <Card aria-labelledby="year-details">
          <CardTitle id="year-details" icon={CalendarDays}>
            {tc("details")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              { label: t("form.startDate"), value: day(year.startDate) },
              { label: t("form.endDate"), value: day(year.endDate) },
            ]}
          />
        </Card>
      </div>
      <div className="mt-6">
        <EntityHistory entityType="AcademicYear" entityId={year.id} permission="org.year.read" />
      </div>
    </>
  );
}
