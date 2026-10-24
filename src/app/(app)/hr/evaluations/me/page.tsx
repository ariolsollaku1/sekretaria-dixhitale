import { ClipboardCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { ownResults } from "@/modules/hr";

// HR-06 AC-9: own results of closed campaigns that show them; nothing about anyone else.
export default async function MyEvaluationResultsPage() {
  const user = await requireUser("/hr/evaluations/me");
  if (!(await can(user, "hr.evaluation.self"))) return <ForbiddenView />;
  const locale = await getLocale();
  const [t, results] = await Promise.all([
    getTranslations("hrEvaluation"),
    ownResults(user.id, locale),
  ]);
  return (
    <>
      <PageHeader title={t("me.title")} />
      {results.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={t("me.none")} description={t("me.noneHint")} />
      ) : (
        results.map((r) => (
          <section key={r.id} aria-labelledby={`res-${r.id}`} className="mb-8 max-w-xl">
            <h2 id={`res-${r.id}`} className="text-lg font-semibold">
              {r.campaignName}
            </h2>
            <p className="text-muted-foreground mb-2 text-sm">
              {r.periodStart} – {r.periodEnd}
            </p>
            <p className="mb-3 text-sm">
              {t("columns.score")}:{" "}
              <strong className="font-tabular">
                {r.score === null ? "—" : r.score.toFixed(2)}
              </strong>
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              {r.lines.map((l) => (
                <div key={l.key} className="contents">
                  <dt className="text-muted-foreground">{l.label}</dt>
                  <dd>{typeof l.value === "boolean" ? (l.value ? t("yes") : t("no")) : l.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
    </>
  );
}
