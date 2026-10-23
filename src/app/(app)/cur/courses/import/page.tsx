import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { CourseImport, writableDepartments } from "@/modules/cur";

export default async function ImportCoursesPage() {
  const user = await requireUser("/cur/courses/import");
  if ((await writableDepartments(user)).length === 0) return <ForbiddenView />;
  const t = await getTranslations("cur");
  return (
    <>
      <PageHeader
        title={t("import.title")}
        breadcrumbs={[
          { label: t("course.title"), href: "/cur/courses" },
          { label: t("import.title") },
        ]}
      />
      <CourseImport />
    </>
  );
}
