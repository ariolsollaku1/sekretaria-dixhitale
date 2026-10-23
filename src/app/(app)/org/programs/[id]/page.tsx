import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
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
  const [t, tu, locale, mayWrite, mayReadUsers, config, subtypes] = await Promise.all([
    getTranslations("org.program"),
    getTranslations("org.unit"),
    getLocale(),
    can(user, "org.program.write"),
    can(user, "iam.user.read"),
    getProgramConfig(),
    listSubtypes(),
  ]);
  const subtype = subtypes.find((s) => s.code === program.subtype);

  return (
    <>
      <PageHeader
        title={`${program.code} — ${program.name}`}
        breadcrumbs={[{ label: t("title"), href: "/org/programs" }, { label: program.code }]}
        actions={
          mayWrite && <UnitStatusActions kind="program" id={program.id} active={program.active} />
        }
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge
          tone={program.active ? "success" : "neutral"}
          label={tu(program.active ? "active" : "inactive")}
        />
        <span>{t(`cycles.${program.cycle}`)}</span>
        {program.subtype && (
          <span>
            · {subtype ? (locale === "en" ? subtype.nameEn : subtype.nameSq) : program.subtype}
          </span>
        )}
        <span>· {t("years", { count: program.durationYears })}</span>
        <span>
          · {t("credits")}: {program.totalCredits}
        </span>
        <Link href={`/org/departments/${program.department.id}`} className="underline">
          {t("department")}: {program.department.code} — {program.department.name}
        </Link>
      </p>

      {mayWrite && (
        <section aria-labelledby="edit-title" className="mb-8">
          <h2 id="edit-title" className="mb-3 text-2xl font-semibold">
            {t("title")}
          </h2>
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
        </section>
      )}

      <section aria-labelledby="coordinators-title" className="mb-8">
        <h2 id="coordinators-title" className="mb-3 text-2xl font-semibold">
          {t("coordinators")}
        </h2>
        {program.coordinators.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noCoordinators")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {program.coordinators.map((c) => (
              <li key={c.id} className="rounded-control border-border bg-card border px-3 py-2">
                {mayReadUsers ? (
                  <Link href={`/admin/users/${c.id}`} className="underline">
                    {c.name}
                  </Link>
                ) : (
                  <span>{c.name}</span>
                )}
                <span className="text-muted-foreground text-sm"> · {c.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EntityHistory
        entityType="StudyProgram"
        entityId={program.id}
        permission="org.program.read"
      />
    </>
  );
}
