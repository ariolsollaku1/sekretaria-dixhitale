import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { GraduationCap, Pencil, Users } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  ProgramForm,
  UnitStatusActions,
  getProgram,
  getProgramConfig,
  listSubtypes,
} from "@/modules/org";

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/org/programs/${id}`);
  if (!(await can(user, "org.program.read"))) return <ForbiddenView />;
  const program = await getProgram(id);
  if (!program) notFound();
  const [t, tu, tc, locale, mayWrite, mayReadUsers, config, subtypes] = await Promise.all([
    getTranslations("org.program"),
    getTranslations("org.unit"),
    getTranslations("common"),
    getLocale(),
    can(user, "org.program.write"),
    can(user, "iam.user.read"),
    getProgramConfig(),
    listSubtypes(),
  ]);
  const subtype = subtypes.find((s) => s.code === program.subtype);

  return (
    <>
      <RecordHero
        icon={GraduationCap}
        name={`${program.code} — ${program.name}`}
        subtitle={t(`cycles.${program.cycle}`)}
        breadcrumbs={[{ label: t("title"), href: "/org/programs" }, { label: program.code }]}
        actions={
          mayWrite && <UnitStatusActions kind="program" id={program.id} active={program.active} />
        }
        badges={
          <StatusBadge
            tone={program.active ? "success" : "neutral"}
            label={tu(program.active ? "active" : "inactive")}
          />
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="program-details">
            <CardTitle id="program-details" icon={GraduationCap}>
              {tc("details")}
            </CardTitle>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: t("cycle"), value: t(`cycles.${program.cycle}`) },
                {
                  label: t("subtype"),
                  value: program.subtype
                    ? subtype
                      ? locale === "en"
                        ? subtype.nameEn
                        : subtype.nameSq
                      : program.subtype
                    : null,
                },
                { label: t("duration"), value: t("years", { count: program.durationYears }) },
                { label: t("credits"), value: program.totalCredits },
                { label: tc("nameEn"), value: program.nameEn },
                {
                  label: t("department"),
                  value: (
                    <Link href={`/org/departments/${program.department.id}`} className="underline">
                      {program.department.code} — {program.department.name}
                    </Link>
                  ),
                },
              ]}
            />
          </Card>
          {mayWrite && (
            <Card aria-labelledby="edit-title">
              <CardTitle id="edit-title" icon={Pencil}>
                {t("title")}
              </CardTitle>
              <ProgramForm
                mode="edit"
                id={program.id}
                durations={config.durations}
                subtypes={subtypes}
                defaults={{
                  cycle: program.cycle,
                  subtype: program.subtype ?? "",
                  code: program.code,
                  name: program.name,
                  nameEn: program.nameEn ?? "",
                  durationYears: program.durationYears,
                  totalCredits: program.totalCredits,
                }}
              />
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="coordinators-title">
            <CardTitle id="coordinators-title" icon={Users}>
              {t("coordinators")}
            </CardTitle>
            {program.coordinators.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noCoordinators")}</p>
            ) : (
              <ul className="divide-border flex flex-col divide-y">
                {program.coordinators.map((c) => (
                  <li key={c.id} className="py-2 first:pt-0 last:pb-0">
                    {mayReadUsers ? (
                      <Link href={`/admin/users/${c.id}`} className="font-semibold underline">
                        {c.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{c.name}</span>
                    )}
                    <span className="text-muted-foreground text-sm"> · {c.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <div className="mt-6">
        <EntityHistory
          entityType="StudyProgram"
          entityId={program.id}
          permission="org.program.read"
        />
      </div>
    </>
  );
}
