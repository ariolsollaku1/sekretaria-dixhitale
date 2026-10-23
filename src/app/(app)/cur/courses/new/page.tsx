import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { CourseForm, listCategories, writableDepartments } from "@/modules/cur";

export default async function NewCoursePage() {
  const user = await requireUser("/cur/courses/new");
  const departments = await writableDepartments(user);
  if (departments.length === 0) return <ForbiddenView />;
  const [t, categories] = await Promise.all([getTranslations("cur.course"), listCategories(true)]);
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/cur/courses" }, { label: t("new") }]}
      />
      <CourseForm mode="create" departments={departments} categories={categories} />
    </>
  );
}
