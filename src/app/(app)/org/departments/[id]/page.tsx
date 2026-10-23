import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { UnitForm, UnitStatusActions, getDepartment } from "@/modules/org";

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/org/departments/${id}`);
  if (!(await can(user, "org.department.read"))) return <ForbiddenView />;
  const department = await getDepartment(id);
  if (!department) notFound();
  const [t, mayWrite, mayReadUsers] = await Promise.all([
    getTranslations("org.unit"),
    can(user, "org.department.write"),
    can(user, "iam.user.read"),
  ]);

  return (
    <>
      <PageHeader
        title={`${department.code} — ${department.name}`}
        breadcrumbs={[
          { label: t("departmentsTitle"), href: "/org/departments" },
          { label: department.code },
        ]}
        actions={
          mayWrite && (
            <UnitStatusActions kind="department" id={department.id} active={department.active} />
          )
        }
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge
          tone={department.active ? "success" : "neutral"}
          label={t(department.active ? "active" : "inactive")}
        />
        <Link href={`/org/faculties/${department.faculty.id}`} className="underline">
          {t("faculty")}: {department.faculty.code} — {department.faculty.name}
        </Link>
        {department.nameEn && <span className="text-muted-foreground">{department.nameEn}</span>}
      </p>

      {mayWrite && (
        <section aria-labelledby="edit-title" className="mb-8">
          <h2 id="edit-title" className="mb-3 text-2xl font-semibold">
            {t("departmentsTitle")}
          </h2>
          <UnitForm
            kind="department"
            mode="edit"
            id={department.id}
            defaults={{
              code: department.code,
              name: department.name,
              nameEn: department.nameEn ?? "",
            }}
          />
        </section>
      )}

      <section aria-labelledby="heads-title" className="mb-8">
        <h2 id="heads-title" className="mb-3 text-2xl font-semibold">
          {t("heads")}
        </h2>
        {department.heads.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noHeads")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {department.heads.map((h) => (
              <li key={h.id} className="rounded-control border-border bg-card border px-3 py-2">
                {mayReadUsers ? (
                  <Link href={`/admin/users/${h.id}`} className="underline">
                    {h.name}
                  </Link>
                ) : (
                  <span>{h.name}</span>
                )}
                <span className="text-muted-foreground text-sm"> · {h.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EntityHistory
        entityType="Department"
        entityId={department.id}
        permission="org.department.read"
      />
    </>
  );
}
