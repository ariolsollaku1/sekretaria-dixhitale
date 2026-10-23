import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { StudentForm, getStudent } from "@/modules/stu";

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/stu/students/${id}/edit`);
  if (!(await can(user, "stu.student.write"))) return <ForbiddenView />;
  const [t, data] = await Promise.all([getTranslations("stu"), getStudent(user, id)]);
  if (!data) notFound();
  const s = data.student;
  const name = `${s.firstName} ${s.lastName}`;
  return (
    <>
      <PageHeader
        title={t("edit")}
        breadcrumbs={[
          { label: t("title"), href: "/stu/students" },
          { label: name, href: `/stu/students/${s.id}` },
          { label: t("edit") },
        ]}
      />
      <StudentForm
        mode="edit"
        studentId={s.id}
        defaults={{
          firstName: s.firstName,
          lastName: s.lastName,
          fatherName: s.fatherName ?? "",
          gender: s.gender,
          birthDate: s.birthDate ?? "",
          nationalId: s.nationalId ?? "",
          phone: s.phone ?? "",
          email: s.email ?? "",
          address: s.address ?? "",
          birthPlace: s.birthPlace ?? "",
          residence: s.residence ?? "",
          nim: s.nim ?? "",
        }}
      />
    </>
  );
}
