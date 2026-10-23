import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { PlanCreateForm, listProgramPlans, writablePrograms } from "@/modules/cur";
import { getCurrentAcademicYear, listYearOptions } from "@/modules/org";

export default async function NewPlanPage() {
  const user = await requireUser("/cur/plans/new");
  if (!(await can(user, "cur.plan.write"))) return <ForbiddenView />;
  const [t, programs, years, current] = await Promise.all([
    getTranslations("cur.plan"),
    writablePrograms(user),
    listYearOptions(),
    getCurrentAcademicYear(),
  ]);
  const plans = (
    await Promise.all(
      programs.map(async (p) =>
        (await listProgramPlans(p.id)).map((x) => ({ ...x, programId: p.id })),
      ),
    )
  ).flat();
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/cur/plans" }, { label: t("new") }]}
      />
      {programs.length === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("noPrograms")}
        </p>
      ) : (
        <PlanCreateForm
          programs={programs}
          years={years}
          plans={plans}
          defaultYearId={current?.id ?? years[0]?.id ?? ""}
        />
      )}
    </>
  );
}
