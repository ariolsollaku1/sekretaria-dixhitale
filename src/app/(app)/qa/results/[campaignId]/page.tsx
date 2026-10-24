import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { ResultFigures, campaignResults, type TargetResult } from "@/modules/qa";

const Summary = ({ r, none }: { r: TargetResult; none: string }) =>
  r.withheld ? (
    <span className="text-muted-foreground">{none}</span>
  ) : (
    <span className="font-tabular font-semibold">
      {r.overall ?? "—"} <span className="text-muted-foreground font-normal">({r.responses})</span>
    </span>
  );

// QA-01 AC-8, AC-9, AC-11: results of a closed campaign, as far as the viewer may see them.
export default async function CampaignResultsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const user = await requireUser(`/qa/results/${campaignId}`);
  if (!(await can(user, "qa.result.read")) && !(await can(user, "qa.result.self")))
    return <ForbiddenView />;
  const [t, r] = await Promise.all([getTranslations("qa"), campaignResults(user, campaignId)]);
  if (!r) notFound();
  const none = t("results.notEnough");
  return (
    <>
      <PageHeader
        title={r.name}
        breadcrumbs={[{ label: t("results.title"), href: "/qa/results" }, { label: r.yearCode }]}
      />
      <p className="text-muted-foreground mb-6 text-sm">
        {t("results.rule", { min: r.minResponses })}
      </p>
      <div className="flex flex-col gap-8">
        <section aria-labelledby="by-assignment">
          <h2 id="by-assignment" className="mb-3 text-2xl font-semibold">
            {t("results.byAssignment")}
          </h2>
          {r.rows.length === 0 ? (
            <p className="rounded-control border-border bg-muted border p-3 text-sm">
              {t("results.noRows")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {r.rows.map((x) => (
                <li
                  key={x.target}
                  className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
                >
                  <div>
                    <p>
                      <span className="font-semibold">{x.courseCode}</span> {x.courseName} ·{" "}
                      {t(`kind.${x.kind}`)}
                    </p>
                    <p className="text-muted-foreground">
                      {x.lecturer} · {x.group} · {x.departmentCode}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Summary r={x.result} none={none} />
                    <Link
                      href={`/qa/results/${r.id}/${x.target}`}
                      className="font-semibold underline"
                    >
                      {t("results.details")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {r.institution && (
          <section aria-labelledby="by-department">
            <h2 id="by-department" className="mb-3 text-2xl font-semibold">
              {t("results.byDepartment")}
            </h2>
            <ul className="flex flex-col gap-2">
              {r.departments.map((d) => (
                <li
                  key={d.code}
                  className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
                >
                  <p>
                    <span className="font-semibold">{d.code}</span> {d.name}
                  </p>
                  <Summary r={d.result} none={none} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.institution && r.administration && (
          <section aria-labelledby="administration">
            <h2 id="administration" className="mb-3 text-2xl font-semibold">
              {t("results.administration")}
            </h2>
            <ResultFigures result={r.administration} />
          </section>
        )}
      </div>
    </>
  );
}
