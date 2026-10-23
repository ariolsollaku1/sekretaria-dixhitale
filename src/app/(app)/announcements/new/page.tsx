import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { AnnouncementForm, listProgramOptions, uploadConfig } from "@/modules/ntf";

export default async function NewAnnouncementPage() {
  const user = await requireUser("/announcements/new");
  if (!(await can(user, "ntf.announcement.write"))) return <ForbiddenView />;
  const [t, programs] = await Promise.all([getTranslations("ntf"), listProgramOptions(user)]);
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/announcements" }, { label: t("new") }]}
      />
      <AnnouncementForm mode="create" programs={programs} upload={uploadConfig()} />
    </>
  );
}
