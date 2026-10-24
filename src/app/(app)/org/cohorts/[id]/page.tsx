import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { Layers, UsersRound } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
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
  const [t, tg, tc, mayWrite, mayWriteGroups, groups, years, approved] = await Promise.all([
    getTranslations("org.cohort"),
    getTranslations("org.group"),
    getTranslations("common"),
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
      <RecordHero
        icon={UsersRound}
        name={title}
        subtitle={cohort.program.name}
        breadcrumbs={[{ label: t("title"), href: "/org/cohorts" }, { label: title }]}
        actions={
          mayWrite && (
            <CohortActions
              cohortId={cohort.id}
              name={cohort.name}
              active={cohort.active}
              planId={cohort.curriculumPlanId}
              plans={choices}
            />
          )
        }
        badges={
          <StatusBadge
            tone={cohort.active ? "success" : "neutral"}
            label={t(cohort.active ? "status.active" : "status.inactive")}
          />
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card aria-labelledby="groups-title">
          <CardTitle id="groups-title" icon={Layers}>
            {tg("title")}
          </CardTitle>
          <GroupManager
            cohortId={cohort.id}
            durationYears={cohort.program.durationYears}
            groups={groups}
            years={years}
            canWrite={mayWriteGroups}
            cohortActive={cohort.active}
          />
        </Card>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="cohort-details">
            <CardTitle id="cohort-details" icon={UsersRound}>
              {tc("details")}
            </CardTitle>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: t("form.program"), value: cohort.program.name },
                { label: t("form.startYear"), value: cohort.startYear.code },
                {
                  label: t("columns.plan"),
                  value: (
                    <Link href={`/cur/plans/${cohort.plan.id}`} className="underline">
                      {t("plan", { version: cohort.plan.version })}
                    </Link>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>
      {mayWrite && (
        <div className="mt-6">
          <EntityHistory entityType="Cohort" entityId={cohort.id} permission="org.cohort.write" />
        </div>
      )}
    </>
  );
}
