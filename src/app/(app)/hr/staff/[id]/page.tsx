import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { StaffStatusActions, getStaff } from "@/modules/hr";
import {
  AccountPanel,
  STAFF_ACCOUNT_ROLES,
  defaultStaffRole,
  getAccountPanel,
} from "@/modules/iam";
import { StaffRecord } from "../../staff-record";

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/hr/staff/${id}`);
  if (!(await can(user, "hr.staff.read"))) return <ForbiddenView />;
  const [t, mayWrite, staff, mayAccount] = await Promise.all([
    getTranslations("hr"),
    can(user, "hr.staff.write"),
    getStaff(user, id),
    can(user, "iam.account.staff"),
  ]);
  if (!staff) notFound(); // outside the user's scope = does not exist
  // IAM-02 AC-9: the account state is shown to those who may manage staff accounts
  const account = mayAccount ? await getAccountPanel(staff.personId) : null;
  const name = `${staff.firstName} ${staff.lastName}`;
  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={[{ label: t("title"), href: "/hr/staff" }, { label: name }]}
        actions={
          mayWrite && (
            <>
              <Link
                href={`/hr/staff/${staff.id}/edit`}
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("edit")}
              </Link>
              <StaffStatusActions staffId={staff.id} active={staff.active} />
            </>
          )
        }
      />
      <p className="mb-4">
        <StatusBadge
          tone={staff.active ? "success" : "neutral"}
          label={t(staff.active ? "status.active" : "status.inactive")}
        />
      </p>
      <StaffRecord staff={staff} />
      {account && (
        <AccountPanel
          kind="STAFF"
          staffId={staff.id}
          state={account.state}
          email={account.email}
          roles={[...STAFF_ACCOUNT_ROLES]}
          defaultRole={defaultStaffRole(staff.kind)}
          canManage={staff.active}
        />
      )}
      {mayWrite && (
        <EntityHistory entityType="Staff" entityId={staff.id} permission="hr.staff.write" />
      )}
    </>
  );
}
