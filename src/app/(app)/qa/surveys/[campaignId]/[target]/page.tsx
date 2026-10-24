import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { SurveyFormView, surveyForm } from "@/modules/qa";

// QA-01 AC-5, AC-13: one anonymous questionnaire; 404 when it is not the student's, not open or done.
export default async function SurveyPage({
  params,
}: {
  params: Promise<{ campaignId: string; target: string }>;
}) {
  const { campaignId, target } = await params;
  const user = await requireUser(`/qa/surveys/${campaignId}/${target}`);
  if (!(await can(user, "qa.survey.submit"))) return <ForbiddenView />;
  const [t, form] = await Promise.all([
    getTranslations("qa"),
    surveyForm(user.id, campaignId, target),
  ]);
  if (!form) notFound();
  const x = form.target;
  return (
    <>
      <PageHeader
        title={
          x.courseCode && x.kind
            ? `${x.courseCode} · ${t(`kind.${x.kind}`)}`
            : t("surveys.administration")
        }
        breadcrumbs={[
          { label: t("surveys.title"), href: "/qa/surveys" },
          { label: form.campaignName },
        ]}
      />
      {x.courseCode && (
        <p className="text-muted-foreground mb-2 text-sm">
          {x.courseName} · {x.lecturer}
        </p>
      )}
      <p role="note" className="rounded-control border-border bg-muted mb-4 border p-3 text-sm">
        {t("surveys.anonymous")}
      </p>
      <SurveyFormView campaignId={campaignId} target={target} questions={form.questions} />
    </>
  );
}
