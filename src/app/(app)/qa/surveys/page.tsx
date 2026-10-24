import { UserX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { ownSurveys } from "@/modules/qa";

// QA-01 AC-4: the evaluations a student can fill in now; done ones are marked.
export default async function SurveysPage() {
  const user = await requireUser("/qa/surveys");
  if (!(await can(user, "qa.survey.submit"))) return <ForbiddenView />;
  const [t, campaigns] = await Promise.all([getTranslations("qa"), ownSurveys(user.id)]);
  return (
    <>
      <PageHeader title={t("surveys.title")} />
      {campaigns === null ? (
        <EmptyState
          icon={UserX}
          title={t("surveys.noStudent")}
          description={t("surveys.noStudentHint")}
        />
      ) : campaigns.length === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("surveys.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <p className="text-muted-foreground text-sm">{t("surveys.anonymous")}</p>
          {campaigns.map((c) => (
            <section key={c.campaignId} aria-labelledby={`c-${c.campaignId}`}>
              <h2 id={`c-${c.campaignId}`} className="mb-3 text-2xl font-semibold">
                {c.campaignName} · {c.yearCode}
              </h2>
              <ul className="flex flex-col gap-2">
                {c.targets.map((x) => (
                  <li
                    key={x.target}
                    className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
                  >
                    <div>
                      {x.courseCode && x.kind ? (
                        <>
                          <p>
                            <span className="font-semibold">{x.courseCode}</span> {x.courseName} ·{" "}
                            {t(`kind.${x.kind}`)}
                          </p>
                          <p className="text-muted-foreground">{x.lecturer}</p>
                        </>
                      ) : (
                        <p className="font-semibold">{t("surveys.administration")}</p>
                      )}
                    </div>
                    {x.done ? (
                      <StatusBadge tone="success" label={t("surveys.done")} />
                    ) : (
                      <Link
                        href={`/qa/surveys/${c.campaignId}/${x.target}`}
                        className="font-semibold underline"
                      >
                        {t("surveys.fill")}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
