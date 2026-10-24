import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { listResultCampaigns } from "@/modules/qa";

// QA-01 AC-8: results exist only for closed campaigns.
export default async function ResultsPage() {
  const user = await requireUser("/qa/results");
  if (!(await can(user, "qa.result.read")) && !(await can(user, "qa.result.self")))
    return <ForbiddenView />;
  const [t, campaigns] = await Promise.all([getTranslations("qa"), listResultCampaigns()]);
  return (
    <>
      <PageHeader title={t("results.title")} />
      {campaigns.length === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("results.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
            >
              <p>
                <span className="font-semibold">{c.name}</span> · {c.yearCode}
              </p>
              <Link href={`/qa/results/${c.id}`} className="font-semibold underline">
                {t("open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
