import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { BarChart3, ClipboardCheck, Users } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { ScrollBox } from "@/components/ui/scroll-box";
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
  const [t, tc, options] = await Promise.all([
    getTranslations("hrEvaluation"),
    getTranslations("common"),
    editable ? listEvaluatorOptions() : Promise.resolve([]),
  ]);

  const percent = campaign.total > 0 ? Math.round((campaign.submitted / campaign.total) * 100) : 0;
  return (
    <>
      <RecordHero
        icon={ClipboardCheck}
        name={campaign.name}
        subtitle={`${campaign.periodStart} – ${campaign.periodEnd}`}
        breadcrumbs={[{ label: t("title"), href: "/hr/evaluations" }, { label: campaign.name }]}
        actions={editable ? <CloseCampaignButton campaignId={campaign.id} /> : undefined}
        badges={
          <StatusBadge
            tone={campaign.status === "OPEN" ? "success" : "neutral"}
            label={t(`campaignStates.${campaign.status}`)}
          />
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="eval-report">
            <CardTitle id="eval-report" icon={BarChart3}>
              {t("report.title")}
            </CardTitle>
            <p className="text-muted-foreground mb-4 text-sm">{t("report.intro")}</p>
            {REPORT_LEVELS.map((level) => (
              <section key={level} aria-labelledby={`rep-${level}`} className="mb-6 last:mb-0">
                <h3 id={`rep-${level}`} className="mb-1 font-medium">
                  {t(`report.levels.${level}`)}
                </h3>
                {report[level].length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("report.empty")}</p>
                ) : (
                  <ScrollBox label={t(`report.levels.${level}`)}>
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t(`report.levels.${level}`)}</caption>
                      <thead>
                        <tr className="border-border border-b text-left">
                          <th scope="col" className="py-2 pr-4">
                            {level === "institution"
                              ? t("report.scope")
                              : t(`report.group.${level}`)}
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
                  </ScrollBox>
                )}
              </section>
            ))}
          </Card>
          <Card aria-labelledby="eval-list">
            <CardTitle id="eval-list" icon={Users}>
              {t("evaluations")}
            </CardTitle>
            <ScrollBox label={t("evaluations")}>
              <table className="w-full text-sm">
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
            </ScrollBox>
          </Card>
        </div>
        <Card aria-labelledby="eval-details">
          <CardTitle id="eval-details" icon={ClipboardCheck}>
            {tc("details")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              { label: t("fields.kind"), value: t(`kinds.${campaign.kind}`) },
              {
                label: t("fields.period"),
                value: (
                  <span className="font-tabular">
                    {campaign.periodStart} – {campaign.periodEnd}
                  </span>
                ),
              },
              {
                label: t("fields.resultsVisible"),
                value: campaign.resultsVisible ? t("yes") : t("no"),
              },
              {
                label: t("progress"),
                value: (
                  <span className="font-tabular">
                    {campaign.submitted} / {campaign.total}
                  </span>
                ),
              },
            ]}
          />
          <div
            role="progressbar"
            aria-label={t("progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="bg-muted mt-4 h-2 rounded-full"
          >
            <div className="bg-brand-gradient h-2 rounded-full" style={{ width: `${percent}%` }} />
          </div>
        </Card>
      </div>
    </>
  );
}
