import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import {
  PlanActions,
  PlanEditor,
  getCreditsPerSemester,
  getPlan,
  listCategories,
  listCourseOptions,
  planTotals,
  type PlanWarning,
} from "@/modules/cur";
import { listYearOptions } from "@/modules/org";

const TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  APPROVED: "success",
  ARCHIVED: "warning",
};

// AC-10: the editor for a draft (with write access), a printable read view otherwise.
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/cur/plans/${id}`);
  const plan = await getPlan(user, id);
  if (!plan) notFound(); // outside the user's scope or not approved for them = does not exist
  const [t, locale, mayWriteRole, perSemester] = await Promise.all([
    getTranslations("cur.plan"),
    getLocale(),
    can(user, "cur.plan.write", { kind: "program", id: plan.programId }),
    getCreditsPerSemester(),
  ]);
  const l = locale as Locale;
  const mayWrite = mayWriteRole;
  const editable = mayWrite && plan.status === "DRAFT";
  const totals = planTotals(plan.courses, {
    durationYears: plan.program.durationYears,
    creditsPerSemester: perSemester,
    programTotalCredits: plan.program.totalCredits,
  });
  const title = t("planTitle", { program: plan.program.code, version: plan.version });
  const warningText = (w: PlanWarning) =>
    w.kind === "semesterCredits"
      ? t("warnings.semesterCredits", {
          year: w.year,
          semester: w.semester,
          actual: w.actual,
          expected: w.expected,
        })
      : t("warnings.totalCredits", { actual: w.actual, expected: w.expected });
  const sumText = (s: {
    credits: number;
    hoursLecture: number;
    hoursSeminar: number;
    hoursLab: number;
  }) =>
    t("sums", {
      credits: s.credits,
      lecture: s.hoursLecture,
      seminar: s.hoursSeminar,
      lab: s.hoursLab,
    });

  const [courses, categories, years] = editable
    ? await Promise.all([listCourseOptions(), listCategories(true), listYearOptions()])
    : [[], [], []];

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("title"), href: "/cur/plans" }, { label: title }]}
        actions={mayWrite && <PlanActions planId={plan.id} status={plan.status} />}
      />
      <p className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={TONE[plan.status]!} label={t(`status.${plan.status}`)} />
        <span>
          {plan.program.name} · {t("validFromShort", { year: plan.validFrom.code })}
        </span>
        {plan.approvedAt && (
          <span className="text-muted-foreground">
            {t("approvedOn", { date: formatDate(plan.approvedAt, l) })}
          </span>
        )}
      </p>
      {plan.notes && <p className="mb-4 max-w-3xl text-sm whitespace-pre-line">{plan.notes}</p>}

      <section aria-labelledby="totals-title" className="mb-8">
        <h2 id="totals-title" className="mb-2 text-lg font-semibold">
          {t("totals")}
        </h2>
        <p className="font-tabular text-sm">{sumText(totals.total)}</p>
        {totals.warnings.length > 0 && (
          <ul className="border-warning/40 bg-warning-bg mt-3 flex max-w-3xl flex-col gap-1 rounded-md border p-3 text-sm">
            {totals.warnings.map((w, i) => (
              <li key={i}>{warningText(w)}</li>
            ))}
          </ul>
        )}
      </section>

      {editable ? (
        <PlanEditor
          planId={plan.id}
          durationYears={plan.program.durationYears}
          rows={plan.courses.map((c) => ({
            id: c.id,
            code: c.course.code,
            name: c.course.name,
            yearOfStudy: c.yearOfStudy,
            semester: c.semester,
            credits: c.credits,
            categoryId: c.categoryId,
            hoursLecture: c.hoursLecture,
            hoursSeminar: c.hoursSeminar,
            hoursLab: c.hoursLab,
            isElective: c.isElective,
          }))}
          courses={courses}
          categories={categories.map((c) => ({
            id: c.id,
            label: l === "en" ? c.nameEn : c.nameSq,
          }))}
          years={years}
          validFromId={plan.validFromAcademicYearId}
          notes={plan.notes ?? ""}
          totalsBySemester={Object.fromEntries(
            totals.years.flatMap((y) =>
              y.semesters.map((s) => [`${y.year}-${s.semester}`, sumText(s.sums)]),
            ),
          )}
        />
      ) : (
        totals.years.map((y) => (
          <section key={y.year} aria-labelledby={`year-${y.year}`} className="mb-8">
            <h2 id={`year-${y.year}`} className="mb-3 text-2xl font-semibold">
              {t("year", { year: y.year })}
              <span className="text-muted-foreground font-tabular ml-3 text-sm font-normal">
                {sumText(y.sums)}
              </span>
            </h2>
            {y.semesters.map((s) => {
              const rows = plan.courses.filter(
                (c) => c.yearOfStudy === y.year && c.semester === s.semester,
              );
              return (
                <div key={s.semester} className="mb-5">
                  <h3 className="mb-2 text-lg font-semibold">
                    {t("semester", { semester: s.semester })}
                    <span className="text-muted-foreground font-tabular ml-2 text-sm font-normal">
                      {sumText(s.sums)}
                    </span>
                  </h3>
                  {rows.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("editor.emptySemester")}</p>
                  ) : (
                    <div className="rounded-card border-border bg-card overflow-x-auto border">
                      <table className="w-full min-w-[40rem] text-sm">
                        <thead>
                          <tr className="border-border border-b text-left">
                            <th scope="col" className="p-3 font-semibold">
                              {t("columns.course")}
                            </th>
                            <th scope="col" className="p-3 font-semibold">
                              {t("columns.category")}
                            </th>
                            <th scope="col" className="p-3 font-semibold">
                              {t("columns.credits")}
                            </th>
                            <th scope="col" className="p-3 font-semibold">
                              {t("columns.hours")}
                            </th>
                            <th scope="col" className="p-3 font-semibold">
                              {t("columns.elective")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((c) => (
                            <tr key={c.id} className="border-border border-b last:border-0">
                              <th scope="row" className="p-3 text-left font-normal">
                                <span className="font-tabular font-semibold">{c.course.code}</span>{" "}
                                — {l === "en" && c.course.nameEn ? c.course.nameEn : c.course.name}
                              </th>
                              <td className="p-3">
                                {c.category
                                  ? l === "en"
                                    ? c.category.nameEn
                                    : c.category.nameSq
                                  : "—"}
                              </td>
                              <td className="font-tabular p-3">{c.credits}</td>
                              <td className="font-tabular p-3">
                                {c.hoursLecture} / {c.hoursSeminar} / {c.hoursLab}
                              </td>
                              <td className="p-3">{c.isElective ? t("yes") : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))
      )}
      {mayWrite && (
        <EntityHistory entityType="CurriculumPlan" entityId={plan.id} permission="cur.plan.write" />
      )}
    </>
  );
}
