import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { StudentForm, listCohortOptions } from "@/modules/stu";

export default async function NewStudentPage() {
  const user = await requireUser("/stu/students/new");
  if (!(await can(user, "stu.student.write"))) return <ForbiddenView />;
  const [t, cohorts] = await Promise.all([getTranslations("stu"), listCohortOptions()]);
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/stu/students" }, { label: t("new") }]}
      />
      <StudentForm mode="create" cohorts={cohorts} />
    </>
  );
}
