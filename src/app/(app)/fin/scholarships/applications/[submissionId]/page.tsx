import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Award, UserRound } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { ScrollBox } from "@/components/ui/scroll-box";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  GrantScholarshipForm,
  VoidScholarshipButton,
  getApplicationPanel,
  listOpenYearOptions,
} from "@/modules/fin";

// FIN-03 AC-3, AC-7: the decision on a scholarship application (the scholarship Finance records).
export default async function ScholarshipDecisionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const user = await requireUser(`/fin/scholarships/applications/${submissionId}`);
  if (!(await can(user, "fin.scholarship.read"))) return <ForbiddenView />;
  const panel = await getApplicationPanel(user, submissionId);
  if (!panel) notFound(); // not a scholarship application of a form you handle = does not exist
  const [t, mayWrite, yearId, years] = await Promise.all([
    getTranslations("fin.scholarship"),
    can(user, "fin.scholarship.write"),
    getSelectedAcademicYear(),
    listOpenYearOptions(),
  ]);
  const requester = panel.requester;
  const identified = "studentNumber" in requester;
  const ready = identified && !requester.problem;
  const hasLive = panel.scholarships.some((s) => !s.voidedAt);
  const defaultYear = years.find((y) => y.id === yearId)?.id ?? years[0]?.id ?? "";

  return (
    <>
      <RecordHero
        icon={Award}
        name={identified ? requester.name : t("decision.title")}
        subtitle={`${panel.reference} · ${t("decision.title")}`}
        breadcrumbs={[
          { label: t("decision.inbox"), href: "/forms/inbox" },
          { label: panel.reference, href: `/forms/inbox/${panel.submissionId}` },
          { label: t("decision.title") },
        ]}
        badges={panel.closed && <StatusBadge tone="neutral" label={t("decision.closedBadge")} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card aria-labelledby="sch-rec">
          <CardTitle id="sch-rec" icon={Award}>
            {t("decision.recorded")}
          </CardTitle>
          {panel.closed && (
            <p className="text-muted-foreground mb-3 text-sm">{t("decision.closed")}</p>
          )}
          {panel.scholarships.length === 0 ? (
            <p className="text-muted-foreground mb-4 text-sm">{t("decision.empty")}</p>
          ) : (
            <ScrollBox label={t("decision.recorded")}>
              <table className="w-full text-sm">
                <caption className="sr-only">{t("decision.recorded")}</caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4">
                      {t("columns.year")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t("columns.type")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t("columns.terms")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t("columns.status")}
                    </th>
                    <th scope="col" className="py-2">
                      <span className="sr-only">{t("columns.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {panel.scholarships.map((s) => (
                    <tr key={s.id} className="border-border border-b align-top">
                      <td className="font-tabular py-2 pr-4">{s.yearCode}</td>
                      <td className="py-2 pr-4">
                        {t(`type.${s.type}`)} · {t(`category.${s.category}`)}
                      </td>
                      <td className="font-tabular py-2 pr-4">
                        {s.type === "FULL" ? "100 %" : s.percent ? `${s.percent} %` : s.amount}
                      </td>
                      <td className="py-2 pr-4">
                        {s.voidedAt
                          ? `${t("status.VOID")} · ${s.voidReason ?? ""}`
                          : t("status.ACTIVE")}
                      </td>
                      <td className="py-2">
                        {mayWrite && !panel.closed && !s.voidedAt && (
                          <VoidScholarshipButton id={s.id} label={s.yearCode} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollBox>
          )}
          {mayWrite && !panel.closed && ready && !hasLive && (
            <GrantScholarshipForm
              submissionId={panel.submissionId}
              years={years}
              defaultYearId={defaultYear}
              defaultCategory={panel.answers.category}
              heading={t("form.decisionTitle")}
            />
          )}
        </Card>

        <Card aria-labelledby="sch-who">
          <CardTitle id="sch-who" icon={UserRound}>
            {t("decision.applicant")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              ...(identified
                ? [
                    { label: t("decision.student"), value: requester.name },
                    {
                      label: t("form.studentNumber"),
                      value: <span className="font-tabular">{requester.studentNumber}</span>,
                    },
                    { label: t("columns.program"), value: requester.enrollment?.programCode },
                  ]
                : []),
              { label: t("decision.year"), value: panel.answers.academicYear },
              {
                label: t("form.category"),
                value: t.has(`category.${panel.answers.category}` as never)
                  ? t(`category.${panel.answers.category}` as never)
                  : null,
              },
              {
                label: t("decision.average"),
                value: <span className="font-tabular">{panel.answers.averageGrade}</span>,
              },
              {
                label: t("decision.motivation"),
                value: (
                  <span className="font-normal whitespace-pre-wrap">
                    {panel.answers.motivation}
                  </span>
                ),
              },
            ]}
          />
          {requester.problem && (
            <p role="alert" className="text-danger mt-3 text-sm font-semibold">
              {t.has(`decision.errors.${requester.problem}` as never)
                ? t(`decision.errors.${requester.problem}` as never)
                : t("decision.errors.generic")}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
