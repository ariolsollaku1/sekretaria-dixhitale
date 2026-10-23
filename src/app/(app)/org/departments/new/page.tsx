import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { UnitForm, listFacultyOptions } from "@/modules/org";

export default async function NewDepartmentPage() {
  const user = await requireUser("/org/departments/new");
  if (!(await can(user, "org.department.write"))) return <ForbiddenView />;
  const [t, faculties] = await Promise.all([getTranslations("org.unit"), listFacultyOptions()]);
  return (
    <>
      <PageHeader
        title={t("createDepartment")}
        breadcrumbs={[
          { label: t("departmentsTitle"), href: "/org/departments" },
          { label: t("createDepartment") },
        ]}
      />
      {faculties.length === 0 ? (
        <EmptyState title={t("noDepartments")} />
      ) : (
        <UnitForm kind="department" mode="create" faculties={faculties} />
      )}
    </>
  );
}
