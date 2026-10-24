import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ClipboardList, ScrollText, Sigma } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { ScrollBox } from "@/components/ui/scroll-box";
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
  const [t, tc, locale, mayWriteRole, perSemester] = await Promise.all([
    getTranslations("cur.plan"),
    getTranslations("common"),
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
      <RecordHero
        icon={ScrollText}
        name={title}
        subtitle={`${plan.program.name} · ${t("validFromShort", { year: plan.validFrom.code })}`}
        breadcrumbs={[{ label: t("title"), href: "/cur/plans" }, { label: title }]}
        actions={mayWrite && <PlanActions planId={plan.id} status={plan.status} />}
        badges={<StatusBadge tone={TONE[plan.status]!} label={t(`status.${plan.status}`)} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
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
              <Card key={y.year} aria-labelledby={`year-${y.year}`}>
                <CardTitle id={`year-${y.year}`} icon={ClipboardList}>
                  {t("year", { year: y.year })}
                  <span className="text-muted-foreground font-tabular ml-3 text-sm font-normal">
                    {sumText(y.sums)}
                  </span>
                </CardTitle>
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
                        <ScrollBox label={t("semester", { semester: s.semester })}>
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
                                    <span className="font-tabular font-semibold">
                                      {c.course.code}
                                    </span>{" "}
                                    —{" "}
                                    {l === "en" && c.course.nameEn
                                      ? c.course.nameEn
                                      : c.course.name}
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
                        </ScrollBox>
                      )}
                    </div>
                  );
                })}
              </Card>
            ))
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="totals-title">
            <CardTitle id="totals-title" icon={Sigma}>
              {t("totals")}
            </CardTitle>
            <p className="font-tabular text-sm">{sumText(totals.total)}</p>
            {totals.warnings.length > 0 && (
              <ul className="border-warning/40 bg-warning-bg mt-3 flex flex-col gap-1 rounded-md border p-3 text-sm">
                {totals.warnings.map((w, i) => (
                  <li key={i}>{warningText(w)}</li>
                ))}
              </ul>
            )}
          </Card>
          <Card aria-labelledby="plan-details">
            <CardTitle id="plan-details" icon={ScrollText}>
              {tc("details")}
            </CardTitle>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: t("columns.program"), value: plan.program.name },
                { label: t("columns.validFrom"), value: plan.validFrom.code },
                {
                  label: t("columns.approvedOn"),
                  value: plan.approvedAt && formatDate(plan.approvedAt, l),
                },
              ]}
            />
            {plan.notes && <p className="mt-4 text-sm whitespace-pre-line">{plan.notes}</p>}
          </Card>
        </div>
      </div>
      {mayWrite && (
        <div className="mt-6">
          <EntityHistory
            entityType="CurriculumPlan"
            entityId={plan.id}
            permission="cur.plan.write"
          />
        </div>
      )}
    </>
  );
}
