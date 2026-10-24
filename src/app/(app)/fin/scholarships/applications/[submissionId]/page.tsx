import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        title={t("decision.title")}
        breadcrumbs={[
          { label: t("decision.inbox"), href: "/forms/inbox" },
          { label: panel.reference, href: `/forms/inbox/${panel.submissionId}` },
          { label: t("decision.title") },
        ]}
      />
      <section aria-labelledby="sch-who" className="mb-8">
        <h2 id="sch-who" className="mb-3 text-2xl font-semibold">
          {t("decision.applicant")}
        </h2>
        <dl className="grid max-w-2xl gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
          {identified && (
            <>
              <dt className="font-semibold">{t("decision.student")}</dt>
              <dd>{requester.name}</dd>
              <dt className="font-semibold">{t("form.studentNumber")}</dt>
              <dd className="font-tabular">{requester.studentNumber}</dd>
              <dt className="font-semibold">{t("columns.program")}</dt>
              <dd>{requester.enrollment?.programCode ?? "—"}</dd>
            </>
          )}
          <dt className="font-semibold">{t("decision.year")}</dt>
          <dd>{panel.answers.academicYear || "—"}</dd>
          <dt className="font-semibold">{t("form.category")}</dt>
          <dd>
            {t.has(`category.${panel.answers.category}` as never)
              ? t(`category.${panel.answers.category}` as never)
              : "—"}
          </dd>
          <dt className="font-semibold">{t("decision.average")}</dt>
          <dd className="font-tabular">{panel.answers.averageGrade || "—"}</dd>
          <dt className="font-semibold">{t("decision.motivation")}</dt>
          <dd className="whitespace-pre-wrap">{panel.answers.motivation || "—"}</dd>
        </dl>
        {requester.problem && (
          <p role="alert" className="text-destructive mt-3 max-w-2xl text-sm">
            {t.has(`decision.errors.${requester.problem}` as never)
              ? t(`decision.errors.${requester.problem}` as never)
              : t("decision.errors.generic")}
          </p>
        )}
      </section>

      <section aria-labelledby="sch-rec" className="mb-8">
        <h2 id="sch-rec" className="mb-3 text-2xl font-semibold">
          {t("decision.recorded")}
        </h2>
        {panel.closed && (
          <p className="text-muted-foreground mb-3 text-sm">{t("decision.closed")}</p>
        )}
        {panel.scholarships.length === 0 ? (
          <p className="text-muted-foreground mb-4 text-sm">{t("decision.empty")}</p>
        ) : (
          <div className="mb-6 overflow-x-auto">
            <table className="w-full max-w-4xl text-sm">
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
          </div>
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
      </section>
    </>
  );
}
