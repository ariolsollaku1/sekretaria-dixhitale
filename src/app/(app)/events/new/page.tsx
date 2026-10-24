import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { EventForm, listAnnouncementOptions, listProgramOptions } from "@/modules/ntf";

export default async function NewEventPage() {
  const user = await requireUser("/events/new");
  if (!(await can(user, "ntf.event.write"))) return <ForbiddenView />;
  const [t, programs, announcements] = await Promise.all([
    getTranslations("evt"),
    listProgramOptions(user, "ntf.event.write"),
    listAnnouncementOptions(user),
  ]);
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/events" }, { label: t("new") }]}
      />
      <EventForm mode="create" programs={programs} announcements={announcements} />
    </>
  );
}
