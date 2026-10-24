import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { listAcademicYears } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { NoticeForm, getNotice } from "@/modules/adm";
import { listProgramOptions } from "@/modules/ntf";

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/adm/notices/${id}/edit`);
  if (!(await can(user, "adm.notice.write"))) return <ForbiddenView />;
  const n = await getNotice(id);
  if (!n) notFound();
  const [t, years, programs] = await Promise.all([
    getTranslations("adm"),
    listAcademicYears(),
    listProgramOptions(user),
  ]);
  return (
    <>
      <PageHeader
        title={t("form.editTitle")}
        breadcrumbs={[
          { label: t("list.title"), href: "/adm/notices" },
          { label: n.title, href: `/announcements/${n.announcementId}` },
          { label: t("form.editTitle") },
        ]}
      />
      <NoticeForm
        mode="edit"
        noticeId={n.id}
        years={years}
        programs={programs}
        defaults={{
          title: n.title,
          body: n.body,
          academicYearId: n.academicYearId,
          programId: n.programId ?? "",
          registrationDeadline: n.registrationDeadline,
          documentsText: n.documents.join("\n"),
          contractExcerpt: n.contractExcerpt,
          showFees: n.showFees,
          publishDate: n.publishDate,
          expiresDate: n.expiresDate,
          pinned: n.pinned,
          emailPush: n.emailPush,
        }}
      />
    </>
  );
}
