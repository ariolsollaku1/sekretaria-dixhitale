import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2, Landmark, Pencil } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
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
  const [t, tc, mayWrite] = await Promise.all([
    getTranslations("org.unit"),
    getTranslations("common"),
    can(user, "org.faculty.write"),
  ]);

  return (
    <>
      <RecordHero
        icon={Landmark}
        name={`${faculty.code} — ${faculty.name}`}
        breadcrumbs={[{ label: t("faculties"), href: "/org/faculties" }, { label: faculty.code }]}
        actions={
          mayWrite && <UnitStatusActions kind="faculty" id={faculty.id} active={faculty.active} />
        }
        badges={
          <StatusBadge
            tone={faculty.active ? "success" : "neutral"}
            label={t(faculty.active ? "active" : "inactive")}
          />
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {mayWrite && (
            <Card aria-labelledby="edit-title">
              <CardTitle id="edit-title" icon={Pencil}>
                {t("faculties")}
              </CardTitle>
              <UnitForm
                kind="faculty"
                mode="edit"
                id={faculty.id}
                defaults={{ code: faculty.code, name: faculty.name, nameEn: faculty.nameEn ?? "" }}
              />
            </Card>
          )}
          <Card aria-labelledby="deps-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <CardTitle id="deps-title" icon={Building2} className="mb-0">
                {t("departmentsOf")}
              </CardTitle>
              {mayWrite && faculty.active && (
                <Link
                  href="/org/departments/new"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  {t("newDepartment")}
                </Link>
              )}
            </div>
            {faculty.departments.length === 0 ? (
              <EmptyState title={t("noDepartments")} />
            ) : (
              <ul className="divide-border flex flex-col divide-y">
                {faculty.departments.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
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
          </Card>
        </div>
        <Card aria-labelledby="fac-details">
          <CardTitle id="fac-details" icon={Landmark}>
            {tc("details")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              { label: t("code"), value: <span className="font-tabular">{faculty.code}</span> },
              { label: tc("nameEn"), value: faculty.nameEn },
            ]}
          />
        </Card>
      </div>
      <div className="mt-6">
        <EntityHistory entityType="Faculty" entityId={faculty.id} permission="org.faculty.read" />
      </div>
    </>
  );
}
