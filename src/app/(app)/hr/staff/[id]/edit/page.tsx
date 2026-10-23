import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { StaffForm, getStaff, listDepartmentOptions } from "@/modules/hr";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/hr/staff/${id}/edit`);
  if (!(await can(user, "hr.staff.write"))) return <ForbiddenView />;
  const [t, staff, departments] = await Promise.all([
    getTranslations("hr"),
    getStaff(user, id),
    listDepartmentOptions(),
  ]);
  if (!staff) notFound();
  const name = `${staff.firstName} ${staff.lastName}`;
  return (
    <>
      <PageHeader
        title={t("edit")}
        breadcrumbs={[
          { label: t("title"), href: "/hr/staff" },
          { label: name, href: `/hr/staff/${staff.id}` },
          { label: t("edit") },
        ]}
      />
      <StaffForm
        mode="edit"
        staffId={staff.id}
        departments={departments}
        defaults={{
          firstName: staff.firstName,
          lastName: staff.lastName,
          fatherName: staff.fatherName ?? "",
          gender: staff.gender,
          birthDate: staff.birthDate ?? "",
          nationalId: staff.nationalId ?? "",
          phone: staff.phone ?? "",
          email: staff.email ?? "",
          address: staff.address ?? "",
          kind: staff.kind,
          category: staff.category,
          degree: staff.degree ?? "",
          title: staff.title ?? "",
          departmentId: staff.departmentId ?? "",
          retired: staff.retired,
          primaryEmployer: staff.primaryEmployer ?? "",
          contractStart: staff.contractStart,
          contractEnd: staff.contractEnd ?? "",
        }}
      />
    </>
  );
}
