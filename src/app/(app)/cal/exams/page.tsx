import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";
import { ExamSessionCreate, listSessions } from "@/modules/cal";
import { getYear } from "@/modules/org";

// CAL-03 AC-1, AC-8: the exam sessions of the selected year; the Secretariat adds sessions here.
export default async function ExamSessionsPage() {
  const user = await requireUser("/cal/exams");
  if (!(await can(user, "cal.exam.read"))) return <ForbiddenView />;
  const [t, locale, yearId, mayWrite] = await Promise.all([
    getTranslations("cal.exams"),
    getLocale(),
    getSelectedAcademicYear(),
    can(user, "cal.exam.write"),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  const sessions = year ? await listSessions(year.id) : [];
  const day = (d: string) => formatPlainDate(d, locale as Locale);

  return (
    <>
      <PageHeader title={t("title")} />
      {!year ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      ) : (
        <>
          {mayWrite && year.status !== "CLOSED" && (
            <ExamSessionCreate academicYearId={year.id} existing={sessions.map((s) => s.type)} />
          )}
          {sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noSessions")}</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {sessions.map((s) => (
                <li key={s.id} className="rounded-card border-border bg-card border p-4">
                  <h2 className="mb-1 text-lg font-semibold">
                    <Link
                      href={`/cal/exams/${s.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {t(`type.${s.type}`)}
                    </Link>
                  </h2>
                  <p className="font-tabular text-sm">
                    {day(s.startDate)} – {day(s.endDate)}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge
                      tone={s.published ? "success" : "neutral"}
                      label={t(s.published ? "status.published" : "status.draft")}
                    />
                    <span className="text-muted-foreground">
                      {t("examCount", { count: s.sittingCount })}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
