import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { UnitForm } from "@/modules/org";

export default async function NewFacultyPage() {
  const user = await requireUser("/org/faculties/new");
  if (!(await can(user, "org.faculty.write"))) return <ForbiddenView />;
  const t = await getTranslations("org.unit");
  return (
    <>
      <PageHeader
        title={t("createFaculty")}
        breadcrumbs={[
          { label: t("faculties"), href: "/org/faculties" },
          { label: t("createFaculty") },
        ]}
      />
      <UnitForm kind="faculty" mode="create" />
    </>
  );
}
