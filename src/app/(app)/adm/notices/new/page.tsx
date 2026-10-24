import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { listAcademicYears, getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { NoticeForm } from "@/modules/adm";
import { listProgramOptions } from "@/modules/ntf";

export default async function NewNoticePage() {
  const user = await requireUser("/adm/notices/new");
  if (!(await can(user, "adm.notice.write"))) return <ForbiddenView />;
  const [t, years, programs, selected] = await Promise.all([
    getTranslations("adm"),
    listAcademicYears(),
    listProgramOptions(user),
    getSelectedAcademicYear(),
  ]);
  return (
    <>
      <PageHeader
        title={t("form.newTitle")}
        breadcrumbs={[
          { label: t("list.title"), href: "/adm/notices" },
          { label: t("form.newTitle") },
        ]}
      />
      <NoticeForm
        mode="create"
        years={years}
        programs={programs}
        defaults={{
          title: "",
          body: "",
          academicYearId: selected ?? "",
          programId: "",
          registrationDeadline: "",
          documentsText: "",
          contractExcerpt: "",
          showFees: true,
          publishDate: "",
          expiresDate: "",
          pinned: false,
          emailPush: false,
        }}
      />
    </>
  );
}
