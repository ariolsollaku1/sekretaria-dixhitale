import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { StaffForm, listDepartmentOptions } from "@/modules/hr";

export default async function NewStaffPage() {
  const user = await requireUser("/hr/staff/new");
  if (!(await can(user, "hr.staff.write"))) return <ForbiddenView />;
  const [t, departments] = await Promise.all([getTranslations("hr"), listDepartmentOptions()]);
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/hr/staff" }, { label: t("new") }]}
      />
      <StaffForm mode="create" departments={departments} />
    </>
  );
}
