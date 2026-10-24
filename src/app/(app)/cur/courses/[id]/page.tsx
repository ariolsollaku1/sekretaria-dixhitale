import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { BookOpen, Clock, Pencil } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  CourseForm,
  CourseStatusActions,
  getCourse,
  listCategories,
  writableDepartments,
} from "@/modules/cur";

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/cur/courses/${id}`);
  if (!(await can(user, "cur.course.read"))) return <ForbiddenView />;
  const course = await getCourse(id);
  if (!course) notFound();
  // Scoped: a head of department may write only courses of their own department.
  const [t, tc, locale, mayWrite, departments, categories] = await Promise.all([
    getTranslations("cur"),
    getTranslations("common"),
    getLocale(),
    can(user, "cur.course.write", { kind: "course", id }),
    writableDepartments(user),
    listCategories(),
  ]);

  const category = course.category
    ? locale === "en"
      ? course.category.nameEn
      : course.category.nameSq
    : t("course.noCategory");
  return (
    <>
      <RecordHero
        icon={BookOpen}
        name={`${course.code} — ${course.name}`}
        subtitle={category}
        breadcrumbs={[{ label: t("course.title"), href: "/cur/courses" }, { label: course.code }]}
        actions={mayWrite && <CourseStatusActions id={course.id} active={course.active} />}
        badges={
          <StatusBadge
            tone={course.active ? "success" : "neutral"}
            label={t(course.active ? "status.active" : "status.inactive")}
          />
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="course-details">
            <CardTitle id="course-details" icon={BookOpen}>
              {tc("details")}
            </CardTitle>
            <InfoList
              items={[
                {
                  label: t("course.code"),
                  value: <span className="font-tabular">{course.code}</span>,
                },
                { label: tc("nameEn"), value: course.nameEn },
                { label: t("course.category"), value: category },
                {
                  label: t("course.department"),
                  value: (
                    <Link href={`/org/departments/${course.department.id}`} className="underline">
                      {course.department.code} — {course.department.name}
                    </Link>
                  ),
                },
              ]}
            />
          </Card>
          {mayWrite ? (
            <Card aria-labelledby="edit-title">
              <CardTitle id="edit-title" icon={Pencil}>
                {t("course.title")}
              </CardTitle>
              <CourseForm
                mode="edit"
                id={course.id}
                departments={
                  departments.some((d) => d.id === course.departmentId)
                    ? departments
                    : [
                        {
                          id: course.departmentId,
                          label: `${course.department.code} — ${course.department.name}`,
                        },
                        ...departments,
                      ]
                }
                categories={categories}
                defaults={{
                  code: course.code,
                  name: course.name,
                  nameEn: course.nameEn ?? "",
                  defaultCredits: course.defaultCredits,
                  categoryId: course.categoryId ?? "",
                  hoursLecture: course.hoursLecture,
                  hoursSeminar: course.hoursSeminar,
                  hoursLab: course.hoursLab,
                  departmentId: course.departmentId,
                }}
              />
            </Card>
          ) : (
            <p className="rounded-control border-border bg-muted border p-3 text-sm">
              {t("course.readOnlyNote")}
            </p>
          )}
        </div>
        <Card aria-labelledby="course-load">
          <CardTitle id="course-load" icon={Clock}>
            {t("course.load")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              { label: t("course.credits"), value: course.defaultCredits },
              { label: t("course.hoursLecture"), value: course.hoursLecture },
              { label: t("course.hoursSeminar"), value: course.hoursSeminar },
              { label: t("course.hoursLab"), value: course.hoursLab },
            ]}
          />
        </Card>
      </div>
      <div className="mt-6">
        <EntityHistory entityType="Course" entityId={course.id} permission="cur.course.read" />
      </div>
    </>
  );
}
