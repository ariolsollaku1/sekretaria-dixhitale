import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";
import {
  EventForm,
  EventStatusActions,
  audienceFilter,
  getEvent,
  listProgramOptions,
  weeksBetween,
} from "@/modules/cal";
import { getYear } from "@/modules/org";
import { db } from "@/lib/db";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/calendar/events/${id}`);
  if (!(await can(user, "cal.event.read"))) return <ForbiddenView />;
  const [t, locale, mayWrite, event] = await Promise.all([
    getTranslations("cal"),
    getLocale(),
    can(user, "cal.event.write"),
    getEvent(id),
  ]);
  if (!event) notFound();
  // AC-9: an event outside the viewer's audience, or a cancelled one for a reader, does not exist.
  const visible = await db.calendarEvent.count({
    where: { id, ...(await audienceFilter(user.id)) },
  });
  if (!visible || (!event.active && !mayWrite)) notFound();

  const year = await getYear(event.academicYearId);
  const l = locale as Locale;
  const day = (d: string) => formatPlainDate(d, l);
  const closed = year?.status === "CLOSED";
  const weeks = year
    ? weeksBetween(event.startDate, event.endDate, year.startDate).map((w) => w.number)
    : [];
  const programs = mayWrite && !closed ? await listProgramOptions() : [];

  return (
    <>
      <PageHeader
        title={event.title}
        breadcrumbs={[{ label: t("title"), href: "/calendar" }, { label: event.title }]}
        actions={
          mayWrite && !closed && <EventStatusActions eventId={event.id} active={event.active} />
        }
      />
      <p className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone="info" label={t(`type.${event.type}`)} />
        <span className="font-tabular">
          {event.startDate === event.endDate
            ? day(event.startDate)
            : `${day(event.startDate)} – ${day(event.endDate)}`}
        </span>
        {weeks.length > 0 && (
          <span className="text-muted-foreground">
            {t("detail.weeks", {
              weeks: weeks.length > 1 ? `${weeks[0]}–${weeks.at(-1)}` : String(weeks[0]),
            })}
          </span>
        )}
        {!event.active && <StatusBadge tone="neutral" label={t("status.cancelled")} />}
      </p>
      <dl className="mb-8 grid max-w-2xl gap-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">{t("form.audience")}</dt>
        <dd>
          {t(`audience.${event.audience}`)}
          {event.cycle && ` — ${t(`cycle.${event.cycle}`)}`}
          {event.programName && ` — ${event.programName}`}
        </dd>
        {event.description && (
          <>
            <dt className="font-semibold">{t("form.description")}</dt>
            <dd className="whitespace-pre-wrap">{event.description}</dd>
          </>
        )}
      </dl>
      {closed && (
        <p className="rounded-control border-border bg-muted mb-6 border p-3 text-sm">
          {t("detail.closedNote")}
        </p>
      )}
      {mayWrite && !closed && (
        <section aria-labelledby="edit-title" className="mb-8">
          <h2 id="edit-title" className="mb-3 text-2xl font-semibold">
            {t("detail.edit")}
          </h2>
          <EventForm
            mode="edit"
            eventId={event.id}
            programs={programs}
            defaults={{
              title: event.title,
              type: event.type,
              startDate: event.startDate,
              endDate: event.endDate,
              description: event.description ?? "",
              audience: event.audience,
              cycle: event.cycle,
              programId: event.programId,
            }}
          />
        </section>
      )}
      {mayWrite && (
        <EntityHistory
          entityType="CalendarEvent"
          entityId={event.id}
          permission="cal.event.write"
        />
      )}
    </>
  );
}
