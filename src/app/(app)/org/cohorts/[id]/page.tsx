import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  CohortActions,
  GroupManager,
  getCohort,
  getPlanDirectory,
  listCohortGroups,
  listYearOptions,
} from "@/modules/org";

export default async function CohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/org/cohorts/${id}`);
  const cohort = await getCohort(user, id);
  if (!cohort) notFound(); // outside the user's programs = does not exist
  const [t, tg, mayWrite, mayWriteGroups, groups, years, approved] = await Promise.all([
    getTranslations("org.cohort"),
    getTranslations("org.group"),
    can(user, "org.cohort.write"),
    can(user, "org.group.write"),
    listCohortGroups(id),
    listYearOptions(),
    getPlanDirectory().listApproved(cohort.programId),
  ]);
  const title = `${cohort.program.code} · ${cohort.name}`;
  const planLabel = (p: { version: number; validFrom: string }) =>
    t("form.planOption", { version: p.version, year: p.validFrom });
  const choices = approved.map((p) => ({ id: p.id, label: planLabel(p) }));
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("title"), href: "/org/cohorts" }, { label: title }]}
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge
          tone={cohort.active ? "success" : "neutral"}
          label={t(cohort.active ? "status.active" : "status.inactive")}
        />
        <span>{cohort.program.name}</span>
        <span>{t("startsIn", { year: cohort.startYear.code })}</span>
        <Link href={`/cur/plans/${cohort.plan.id}`} className="underline">
          {t("plan", { version: cohort.plan.version })}
        </Link>
      </p>
      {mayWrite && (
        <div className="mb-8">
          <CohortActions
            cohortId={cohort.id}
            name={cohort.name}
            active={cohort.active}
            planId={cohort.curriculumPlanId}
            plans={choices}
          />
        </div>
      )}
      <section aria-labelledby="groups-title" className="mb-8">
        <h2 id="groups-title" className="mb-3 text-2xl font-semibold">
          {tg("title")}
        </h2>
        <GroupManager
          cohortId={cohort.id}
          durationYears={cohort.program.durationYears}
          groups={groups}
          years={years}
          canWrite={mayWriteGroups}
          cohortActive={cohort.active}
        />
      </section>
      {mayWrite && (
        <EntityHistory entityType="Cohort" entityId={cohort.id} permission="org.cohort.write" />
      )}
    </>
  );
}
