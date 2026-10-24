import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { CampaignForm, listCampaigns } from "@/modules/qa";
import { getCurrentAcademicYear, listYearOptions } from "@/modules/org";

// QA-01 AC-1: the campaigns of the Quality Assurance Unit and the form for a new one.
export default async function CampaignsPage() {
  const user = await requireUser("/qa/campaigns");
  if (!(await can(user, "qa.campaign.manage"))) return <ForbiddenView />;
  const [t, campaigns, years, current] = await Promise.all([
    getTranslations("qa"),
    listCampaigns(),
    listYearOptions(),
    getCurrentAcademicYear(),
  ]);
  const tone = { DRAFT: "neutral", OPEN: "success", CLOSED: "info" } as const;
  return (
    <>
      <PageHeader title={t("campaigns.title")} />
      <div className="flex flex-col gap-8">
        {years.length > 0 && (
          <CampaignForm
            years={years}
            campaigns={campaigns.map((c) => ({ id: c.id, label: `${c.yearCode} · ${c.name}` }))}
            defaultYearId={current?.id ?? years[0]!.id}
          />
        )}
        {campaigns.length === 0 ? (
          <p className="rounded-control border-border bg-muted border p-3 text-sm">
            {t("campaigns.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-muted-foreground">
                    {c.yearCode} · {t("campaigns.questionCount", { count: c.questions })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={tone[c.status]} label={t(`status.${c.status}`)} />
                  <Link href={`/qa/campaigns/${c.id}`} className="font-semibold underline">
                    {t("open")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
