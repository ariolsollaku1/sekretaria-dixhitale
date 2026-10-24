import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { instantToZonedDateTime } from "@/lib/i18n/zone";
import {
  EventForm,
  getEvent,
  listAnnouncementOptions,
  listProgramOptions,
  mayManageEvent,
} from "@/modules/ntf";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/events/${id}/edit`);
  const e = await getEvent(id);
  if (!e) notFound();
  if (!(await mayManageEvent(user, e)) || e.status === "CANCELLED") return <ForbiddenView />;
  const [t, programs, announcements] = await Promise.all([
    getTranslations("evt"),
    listProgramOptions(user, "ntf.event.write"),
    listAnnouncementOptions(user),
  ]);
  return (
    <>
      <PageHeader
        title={t("edit")}
        breadcrumbs={[
          { label: t("title"), href: "/events" },
          { label: e.title, href: `/events/${e.id}` },
          { label: t("edit") },
        ]}
      />
      <EventForm
        mode="edit"
        eventId={e.id}
        programs={programs}
        announcements={announcements}
        defaults={{
          title: e.title,
          description: e.description,
          location: e.location,
          startsAt: instantToZonedDateTime(e.startsAt),
          endsAt: e.endsAt ? instantToZonedDateTime(e.endsAt) : "",
          capacity: e.capacity === null ? "" : String(e.capacity),
          registrationDeadline: e.registrationDeadline
            ? instantToZonedDateTime(e.registrationDeadline)
            : "",
          audience: e.audience,
          cycle: e.cycle,
          programId: e.programId,
          announcementId: e.announcementId,
        }}
      />
    </>
  );
}
