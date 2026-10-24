import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  AssignEvaluator,
  CloseCampaignButton,
  getCampaignView,
  listEvaluatorOptions,
  REPORT_LEVELS,
} from "@/modules/hr";

// HR-06 AC-3, AC-6, AC-8, AC-10: one campaign with its report and evaluations.
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/hr/evaluations/${id}`);
  const [canManage, canRead] = await Promise.all([
    can(user, "hr.evaluation.manage"),
    can(user, "hr.evaluation.read"),
  ]);
  if (!canManage && !canRead) return <ForbiddenView />;
  const view = await getCampaignView(user, id);
  if (!view) notFound();
  const { campaign, evaluations, report } = view;
  const editable = canManage && campaign.status === "OPEN";
  const [t, options] = await Promise.all([
    getTranslations("hrEvaluation"),
    editable ? listEvaluatorOptions() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={campaign.name}
        breadcrumbs={[{ label: t("title"), href: "/hr/evaluations" }, { label: campaign.name }]}
        actions={editable ? <CloseCampaignButton campaignId={campaign.id} /> : undefined}
      />
      <dl className="mb-6 grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("fields.kind")}</dt>
        <dd>{t(`kinds.${campaign.kind}`)}</dd>
        <dt className="text-muted-foreground">{t("fields.period")}</dt>
        <dd>
          {campaign.periodStart} – {campaign.periodEnd}
        </dd>
        <dt className="text-muted-foreground">{t("columns.state")}</dt>
        <dd>
          <StatusBadge
            tone={campaign.status === "OPEN" ? "success" : "neutral"}
            label={t(`campaignStates.${campaign.status}`)}
          />
        </dd>
        <dt className="text-muted-foreground">{t("fields.resultsVisible")}</dt>
        <dd>{campaign.resultsVisible ? t("yes") : t("no")}</dd>
        <dt className="text-muted-foreground">{t("progress")}</dt>
        <dd className="font-tabular">
          {campaign.submitted} / {campaign.total}
        </dd>
      </dl>

      <h2 className="mb-2 text-lg font-semibold">{t("report.title")}</h2>
      <p className="text-muted-foreground mb-3 max-w-2xl text-sm">{t("report.intro")}</p>
      {REPORT_LEVELS.map((level) => (
        <section key={level} aria-labelledby={`rep-${level}`} className="mb-6">
          <h3 id={`rep-${level}`} className="mb-1 font-medium">
            {t(`report.levels.${level}`)}
          </h3>
          {report[level].length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("report.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full max-w-3xl text-sm">
                <caption className="sr-only">{t(`report.levels.${level}`)}</caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4">
                      {level === "institution" ? t("report.scope") : t(`report.group.${level}`)}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t("report.total")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t("report.submitted")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t("report.average")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report[level].map((g) => (
                    <tr key={g.key} className="border-border border-b">
                      <td className="py-2 pr-4">
                        {level === "institution" ? t("report.institution") : g.key || "—"}
                      </td>
                      <td className="font-tabular py-2 pr-4">{g.total}</td>
                      <td className="font-tabular py-2 pr-4">{g.submitted}</td>
                      <td className="font-tabular py-2 pr-4">
                        {g.average === null ? "—" : g.average.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <h2 className="mb-2 text-lg font-semibold">{t("evaluations")}</h2>
      <div className="overflow-x-auto">
        <table className="w-full max-w-4xl text-sm">
          <caption className="sr-only">{t("evaluations")}</caption>
          <thead>
            <tr className="border-border border-b text-left">
              <th scope="col" className="py-2 pr-4">
                {t("columns.person")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("columns.department")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("columns.evaluator")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("columns.state")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("columns.score")}
              </th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((e) => (
              <tr key={e.id} className="border-border border-b align-top">
                <td className="py-2 pr-4">{e.name}</td>
                <td className="py-2 pr-4">{e.departmentCode ?? "—"}</td>
                <td className="py-2 pr-4">
                  {editable ? (
                    <AssignEvaluator
                      evaluationId={e.id}
                      current={e.evaluatorId}
                      options={options}
                      person={e.name}
                    />
                  ) : (
                    (e.evaluatorName ?? t("unassigned"))
                  )}
                </td>
                <td className="py-2 pr-4">{t(`states.${e.state}`)}</td>
                <td className="font-tabular py-2 pr-4">
                  {e.score === null ? "—" : e.score.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
