import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { UnitForm, UnitStatusActions, getFaculty } from "@/modules/org";

export default async function FacultyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/org/faculties/${id}`);
  if (!(await can(user, "org.faculty.read"))) return <ForbiddenView />;
  const faculty = await getFaculty(id);
  if (!faculty) notFound();
  const [t, mayWrite] = await Promise.all([
    getTranslations("org.unit"),
    can(user, "org.faculty.write"),
  ]);

  return (
    <>
      <PageHeader
        title={`${faculty.code} — ${faculty.name}`}
        breadcrumbs={[{ label: t("faculties"), href: "/org/faculties" }, { label: faculty.code }]}
        actions={
          mayWrite && <UnitStatusActions kind="faculty" id={faculty.id} active={faculty.active} />
        }
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge
          tone={faculty.active ? "success" : "neutral"}
          label={t(faculty.active ? "active" : "inactive")}
        />
        {faculty.nameEn && <span className="text-muted-foreground">{faculty.nameEn}</span>}
      </p>

      {mayWrite && (
        <section aria-labelledby="edit-title" className="mb-8">
          <h2 id="edit-title" className="mb-3 text-2xl font-semibold">
            {t("faculties")}
          </h2>
          <UnitForm
            kind="faculty"
            mode="edit"
            id={faculty.id}
            defaults={{ code: faculty.code, name: faculty.name, nameEn: faculty.nameEn ?? "" }}
          />
        </section>
      )}

      <section aria-labelledby="deps-title" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="deps-title" className="text-2xl font-semibold">
            {t("departmentsOf")}
          </h2>
          {mayWrite && faculty.active && (
            <Link href="/org/departments/new" className={buttonVariants({ variant: "secondary" })}>
              {t("newDepartment")}
            </Link>
          )}
        </div>
        {faculty.departments.length === 0 ? (
          <EmptyState title={t("noDepartments")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {faculty.departments.map((d) => (
              <li
                key={d.id}
                className="rounded-control border-border bg-card flex items-center justify-between gap-3 border px-3 py-2"
              >
                <Link href={`/org/departments/${d.id}`} className="underline">
                  <span className="font-tabular">{d.code}</span> — {d.name}
                </Link>
                <StatusBadge
                  tone={d.active ? "success" : "neutral"}
                  label={t(d.active ? "active" : "inactive")}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <EntityHistory entityType="Faculty" entityId={faculty.id} permission="org.faculty.read" />
    </>
  );
}
