import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { CampaignActions, QuestionEditor, getCampaign } from "@/modules/qa";

// QA-01 AC-2, AC-3, AC-10: questions (draft only), open/close, and the participation counts.
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/qa/campaigns/${id}`);
  if (!(await can(user, "qa.campaign.manage"))) return <ForbiddenView />;
  const [t, c] = await Promise.all([getTranslations("qa"), getCampaign(id)]);
  if (!c) notFound();
  const tone = { DRAFT: "neutral", OPEN: "success", CLOSED: "info" } as const;
  return (
    <>
      <PageHeader
        title={c.name}
        breadcrumbs={[
          { label: t("campaigns.title"), href: "/qa/campaigns" },
          { label: c.yearCode },
        ]}
        actions={<StatusBadge tone={tone[c.status]} label={t(`status.${c.status}`)} />}
      />
      <div className="flex flex-col gap-8">
        <CampaignActions campaignId={c.id} status={c.status} />
        {c.status === "CLOSED" && (
          <p>
            <Link href={`/qa/results/${c.id}`} className="font-semibold underline">
              {t("campaigns.seeResults")}
            </Link>
          </p>
        )}
        <section aria-labelledby="questions-title">
          <h2 id="questions-title" className="mb-3 text-2xl font-semibold">
            {t("questions.title")}
          </h2>
          <QuestionEditor
            key={JSON.stringify(c.questionList)}
            campaignId={c.id}
            questions={c.questionList}
            editable={c.status === "DRAFT"}
          />
        </section>
        {c.status !== "DRAFT" && (
          <section aria-labelledby="participation-title">
            <h2 id="participation-title" className="mb-1 text-2xl font-semibold">
              {t("participation.title")}
            </h2>
            <p className="text-muted-foreground mb-3 text-sm">{t("participation.hint")}</p>
            <ul className="flex flex-col gap-2">
              {c.participation.map((p) => (
                <li
                  key={p.target}
                  className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
                >
                  <div>
                    {p.courseCode && p.kind ? (
                      <>
                        <p>
                          <span className="font-semibold">{p.courseCode}</span> {p.courseName} ·{" "}
                          {t(`kind.${p.kind}`)}
                        </p>
                        <p className="text-muted-foreground">
                          {p.group} · {p.lecturer}
                        </p>
                      </>
                    ) : (
                      <p className="font-semibold">{t("participation.administration")}</p>
                    )}
                  </div>
                  <p className="font-tabular font-semibold">
                    {p.answered} / {p.eligible}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
