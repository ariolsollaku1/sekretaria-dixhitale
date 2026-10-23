import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { zonedDay } from "@/lib/i18n/zone";
import {
  AnnouncementForm,
  getAnnouncement,
  listAttachments,
  listProgramOptions,
  mayManage,
  uploadConfig,
} from "@/modules/ntf";

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/announcements/${id}/edit`);
  const a = await getAnnouncement(id);
  if (!a) notFound();
  if (!(await mayManage(user, a))) return <ForbiddenView />;
  const [t, programs, files] = await Promise.all([
    getTranslations("ntf"),
    listProgramOptions(user),
    listAttachments(id),
  ]);
  return (
    <>
      <PageHeader
        title={t("edit")}
        breadcrumbs={[
          { label: t("title"), href: "/announcements" },
          { label: a.title, href: `/announcements/${a.id}` },
          { label: t("edit") },
        ]}
      />
      <AnnouncementForm
        mode="edit"
        announcementId={a.id}
        programs={programs}
        upload={uploadConfig()}
        attachments={files.map((f) => ({ id: f.id, fileName: f.fileName }))}
        defaults={{
          title: a.title,
          body: a.body,
          audience: a.audience,
          cycle: a.cycle,
          programId: a.programId,
          publishDate: a.publishAt ? zonedDay(a.publishAt) : "",
          // the stored expiry is the start of the day after the last visible day
          expiresDate: a.expiresAt ? zonedDay(new Date(a.expiresAt.getTime() - 1)) : "",
          pinned: a.pinned,
          emailPush: a.emailPush,
        }}
      />
    </>
  );
}
