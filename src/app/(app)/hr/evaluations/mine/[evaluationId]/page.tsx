import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { localize } from "@/lib/forms/definition";
import { EvaluationForm, getEvaluationToFill } from "@/modules/hr";

// HR-06 AC-4, AC-7: only the assigned evaluator, only while the campaign is open.
export default async function EvaluatePage({
  params,
}: {
  params: Promise<{ evaluationId: string }>;
}) {
  const { evaluationId } = await params;
  const user = await requireUser(`/hr/evaluations/mine/${evaluationId}`);
  if (!(await can(user, "hr.evaluation.fill"))) return <ForbiddenView />;
  const ev = await getEvaluationToFill(user.id, evaluationId);
  if (!ev) notFound();
  const [t, locale] = await Promise.all([getTranslations("hrEvaluation"), getLocale()]);
  return (
    <>
      <PageHeader
        title={t("evaluate.title", { person: ev.evaluatedName })}
        breadcrumbs={[
          { label: t("mine.title"), href: "/hr/evaluations/mine" },
          { label: ev.evaluatedName },
        ]}
      />
      <p className="text-muted-foreground mb-1 text-sm">{ev.campaignName}</p>
      <p className="mb-6 max-w-xl text-sm">
        {localize(ev.form.definition.title, locale)}
        {ev.form.definition.description && (
          <>
            {" — "}
            {localize(ev.form.definition.description, locale)}
          </>
        )}
      </p>
      <EvaluationForm
        evaluationId={ev.id}
        definition={ev.form.definition}
        initial={ev.answers}
        locale={locale}
      />
    </>
  );
}
