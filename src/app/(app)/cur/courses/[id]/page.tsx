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
  const [t, locale, mayWrite, departments, categories] = await Promise.all([
    getTranslations("cur"),
    getLocale(),
    can(user, "cur.course.write", { kind: "course", id }),
    writableDepartments(user),
    listCategories(),
  ]);

  return (
    <>
      <PageHeader
        title={`${course.code} — ${course.name}`}
        breadcrumbs={[{ label: t("course.title"), href: "/cur/courses" }, { label: course.code }]}
        actions={mayWrite && <CourseStatusActions id={course.id} active={course.active} />}
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge
          tone={course.active ? "success" : "neutral"}
          label={t(course.active ? "status.active" : "status.inactive")}
        />
        <span>
          {course.category
            ? locale === "en"
              ? course.category.nameEn
              : course.category.nameSq
            : t("course.noCategory")}
        </span>
        <span>
          · {t("course.credits")}: {course.defaultCredits}
        </span>
        <span>
          · {course.hoursLecture} / {course.hoursSeminar} / {course.hoursLab}
        </span>
        <Link href={`/org/departments/${course.department.id}`} className="underline">
          {course.department.code} — {course.department.name}
        </Link>
        {course.nameEn && <span className="text-muted-foreground">{course.nameEn}</span>}
      </p>
      {mayWrite ? (
        <section aria-labelledby="edit-title" className="mb-8">
          <h2 id="edit-title" className="mb-3 text-2xl font-semibold">
            {t("course.title")}
          </h2>
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
        </section>
      ) : (
        <p className="rounded-control border-border bg-muted mb-8 border p-3 text-sm">
          {t("course.readOnlyNote")}
        </p>
      )}
      <EntityHistory entityType="Course" entityId={course.id} permission="cur.course.read" />
    </>
  );
}
