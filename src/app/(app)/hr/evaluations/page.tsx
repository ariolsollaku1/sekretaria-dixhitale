import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { evaluationsTable, listCampaigns, OpenCampaignForm } from "@/modules/hr";

// HR-06 AC-2, AC-8: campaigns (open one when allowed) and the evaluations inside the reader's scope.
export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/hr/evaluations");
  const [canManage, canRead] = await Promise.all([
    can(user, "hr.evaluation.manage"),
    can(user, "hr.evaluation.read"),
  ]);
  if (!canManage && !canRead) return <ForbiddenView />;
  const [t, search, campaigns] = await Promise.all([
    getTranslations("hrEvaluation"),
    searchParams,
    listCampaigns(user),
  ]);
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("intro")}</p>
      {canManage && (
        <div className="mb-8">
          <OpenCampaignForm />
        </div>
      )}
      <section aria-labelledby="campaigns-h" className="mb-8">
        <h2 id="campaigns-h" className="mb-2 text-lg font-semibold">
          {t("campaigns")}
        </h2>
        {campaigns.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noCampaigns")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full max-w-4xl text-sm">
              <caption className="sr-only">{t("campaigns")}</caption>
              <thead>
                <tr className="border-border border-b text-left">
                  <th scope="col" className="py-2 pr-4">
                    {t("fields.name")}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t("fields.kind")}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t("fields.period")}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t("columns.state")}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t("progress")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-border border-b">
                    <td className="py-2 pr-4">
                      <Link href={`/hr/evaluations/${c.id}`} className="underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{t(`kinds.${c.kind}`)}</td>
                    <td className="py-2 pr-4">
                      {c.periodStart} – {c.periodEnd}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge
                        tone={c.status === "OPEN" ? "success" : "neutral"}
                        label={t(`campaignStates.${c.status}`)}
                      />
                    </td>
                    <td className="font-tabular py-2 pr-4">
                      {c.submitted} / {c.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {canRead && (
        <section aria-labelledby="evals-h">
          <h2 id="evals-h" className="mb-2 text-lg font-semibold">
            {t("evaluations")}
          </h2>
          <TablePage
            def={evaluationsTable}
            search={search}
            user={user}
            basePath="/hr/evaluations"
          />
        </section>
      )}
    </>
  );
}
