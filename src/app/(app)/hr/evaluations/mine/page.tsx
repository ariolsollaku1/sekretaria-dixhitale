import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { myEvaluations } from "@/modules/hr";

// HR-06 AC-4: the evaluations the signed-in user has to fill in (open campaigns).
export default async function MyEvaluationsPage() {
  const user = await requireUser("/hr/evaluations/mine");
  if (!(await can(user, "hr.evaluation.fill"))) return <ForbiddenView />;
  const [t, rows] = await Promise.all([getTranslations("hrEvaluation"), myEvaluations(user.id)]);
  return (
    <>
      <PageHeader title={t("mine.title")} />
      <p className="mb-4 text-sm">
        <Link href="/hr/evaluations/me" className="underline">
          {t("me.link")}
        </Link>
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={t("mine.none")} description={t("mine.noneHint")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl text-sm">
            <caption className="sr-only">{t("mine.title")}</caption>
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="py-2 pr-4">
                  {t("columns.person")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("columns.campaign")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("columns.department")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("mine.until")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("columns.state")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border border-b">
                  <td className="py-2 pr-4">
                    <Link href={`/hr/evaluations/mine/${r.id}`} className="underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{r.campaignName}</td>
                  <td className="py-2 pr-4">{r.departmentCode ?? "—"}</td>
                  <td className="py-2 pr-4">{r.periodEnd}</td>
                  <td className="py-2 pr-4">{t(`states.${r.state}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
