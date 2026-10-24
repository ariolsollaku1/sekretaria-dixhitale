import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { ResultFigures, targetResults } from "@/modules/qa";

// QA-01 AC-9, AC-11: the figures per question of one course or of the administration.
export default async function TargetResultsPage({
  params,
}: {
  params: Promise<{ campaignId: string; target: string }>;
}) {
  const { campaignId, target } = await params;
  const user = await requireUser(`/qa/results/${campaignId}/${target}`);
  if (!(await can(user, "qa.result.read")) && !(await can(user, "qa.result.self")))
    return <ForbiddenView />;
  const [t, d] = await Promise.all([
    getTranslations("qa"),
    targetResults(user, campaignId, target),
  ]);
  if (!d) notFound();
  return (
    <>
      <PageHeader
        title={
          d.title
            ? `${d.title.courseCode} · ${t(`kind.${d.title.kind}`)}`
            : t("results.administration")
        }
        breadcrumbs={[
          { label: t("results.title"), href: "/qa/results" },
          { label: d.campaignName, href: `/qa/results/${d.campaignId}` },
        ]}
      />
      {d.title && (
        <p className="text-muted-foreground mb-4 text-sm">
          {d.title.courseName} · {d.title.lecturer} · {d.title.group}
        </p>
      )}
      <ResultFigures result={d.result} />
    </>
  );
}
