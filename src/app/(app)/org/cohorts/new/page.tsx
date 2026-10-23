import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  CohortForm,
  getCurrentAcademicYear,
  getPlanDirectory,
  listProgramOptionsForCohorts,
  listYearOptions,
} from "@/modules/org";

export default async function NewCohortPage() {
  const user = await requireUser("/org/cohorts/new");
  if (!(await can(user, "org.cohort.write"))) return <ForbiddenView />;
  const [t, programs, years, current] = await Promise.all([
    getTranslations("org.cohort"),
    listProgramOptionsForCohorts(),
    listYearOptions(),
    getCurrentAcademicYear(),
  ]);
  const directory = getPlanDirectory();
  const plans = (
    await Promise.all(
      programs.map(async (p) =>
        (await directory.listApproved(p.id)).map((x) => ({
          id: x.id,
          programId: p.id,
          label: t("form.planOption", { version: x.version, year: x.validFrom }),
        })),
      ),
    )
  ).flat();
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/org/cohorts" }, { label: t("new") }]}
      />
      <CohortForm
        programs={programs}
        years={years}
        plans={plans}
        defaultYearId={current?.id ?? years[0]?.id ?? ""}
      />
    </>
  );
}
