import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { StaffImport } from "@/modules/hr";

export default async function ImportStaffPage() {
  const user = await requireUser("/hr/staff/import");
  if (!(await can(user, "hr.staff.write"))) return <ForbiddenView />;
  const t = await getTranslations("hr");
  return (
    <>
      <PageHeader
        title={t("import.title")}
        breadcrumbs={[{ label: t("title"), href: "/hr/staff" }, { label: t("import.title") }]}
      />
      <StaffImport />
    </>
  );
}
