import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { TeachingHubView, getTeachingHub } from "@/modules/hr";

// HR-07 AC-1: the lecturer's own hub; everything on it is keyed on the signed-in user.
export default async function TeachingHubPage() {
  const user = await requireUser("/hr/teaching");
  if (!(await can(user, "hr.workspace.self"))) return <ForbiddenView />;
  const [t, yearId] = await Promise.all([
    getTranslations("hr.workspace"),
    getSelectedAcademicYear(),
  ]);
  const hub = await getTeachingHub(user, yearId);
  return (
    <>
      <PageHeader title={t("title")} />
      {hub ? (
        <TeachingHubView hub={hub} />
      ) : (
        <EmptyState icon={UserX} title={t("noStaff")} description={t("noStaffHint")} />
      )}
    </>
  );
}
