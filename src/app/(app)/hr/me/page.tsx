import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenView } from "@/components/forbidden-view";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { getOwnStaff } from "@/modules/hr";
import { StaffRecord } from "../staff-record";

// AC-10: a staff member sees their own record and nothing else.
export default async function MyStaffRecordPage() {
  const user = await requireUser("/hr/me");
  if (!(await can(user, "hr.staff.self"))) return <ForbiddenView />;
  const [t, staff] = await Promise.all([getTranslations("hr"), getOwnStaff(user)]);
  return (
    <>
      <PageHeader title={t("me.title")} />
      {staff ? (
        <StaffRecord staff={staff} />
      ) : (
        <EmptyState icon={UserX} title={t("me.none")} description={t("me.noneHint")} />
      )}
    </>
  );
}
