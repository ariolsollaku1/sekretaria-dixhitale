import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { PortalHomeView, getPortalHome } from "@/modules/stu";

// STU-03 AC-1: the student's own home page; everything on it is keyed on the signed-in user.
export default async function StudentHomePage() {
  const user = await requireUser("/stu/home");
  if (!(await can(user, "stu.student.self"))) return <ForbiddenView />;
  const [t, home] = await Promise.all([getTranslations("stu.home"), getPortalHome(user)]);
  return (
    <>
      <PageHeader title={t("title")} />
      {home ? (
        <PortalHomeView home={home} />
      ) : (
        <EmptyState icon={UserX} title={t("noRecord")} description={t("noRecordHint")} />
      )}
    </>
  );
}
