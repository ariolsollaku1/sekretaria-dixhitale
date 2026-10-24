import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { Building2, Pencil, Users } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
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
  const [t, tc, mayWrite, mayReadUsers] = await Promise.all([
    getTranslations("org.unit"),
    getTranslations("common"),
    can(user, "org.department.write"),
    can(user, "iam.user.read"),
  ]);

  return (
    <>
      <RecordHero
        icon={Building2}
        name={`${department.code} — ${department.name}`}
        subtitle={department.faculty.name}
        breadcrumbs={[
          { label: t("departmentsTitle"), href: "/org/departments" },
          { label: department.code },
        ]}
        actions={
          mayWrite && (
            <UnitStatusActions kind="department" id={department.id} active={department.active} />
          )
        }
        badges={
          <StatusBadge
            tone={department.active ? "success" : "neutral"}
            label={t(department.active ? "active" : "inactive")}
          />
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {mayWrite && (
            <Card aria-labelledby="edit-title">
              <CardTitle id="edit-title" icon={Pencil}>
                {t("departmentsTitle")}
              </CardTitle>
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
            </Card>
          )}
          <Card aria-labelledby="heads-title">
            <CardTitle id="heads-title" icon={Users}>
              {t("heads")}
            </CardTitle>
            {department.heads.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noHeads")}</p>
            ) : (
              <ul className="divide-border flex flex-col divide-y">
                {department.heads.map((h) => (
                  <li key={h.id} className="py-2 first:pt-0 last:pb-0">
                    {mayReadUsers ? (
                      <Link href={`/admin/users/${h.id}`} className="font-semibold underline">
                        {h.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{h.name}</span>
                    )}
                    <span className="text-muted-foreground text-sm"> · {h.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card aria-labelledby="dep-details">
          <CardTitle id="dep-details" icon={Building2}>
            {tc("details")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              { label: t("code"), value: <span className="font-tabular">{department.code}</span> },
              { label: tc("nameEn"), value: department.nameEn },
              {
                label: t("faculty"),
                value: (
                  <Link href={`/org/faculties/${department.faculty.id}`} className="underline">
                    {department.faculty.code} — {department.faculty.name}
                  </Link>
                ),
              },
            ]}
          />
        </Card>
      </div>
      <div className="mt-6">
        <EntityHistory
          entityType="Department"
          entityId={department.id}
          permission="org.department.read"
        />
      </div>
    </>
  );
}
