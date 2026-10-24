import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { CalendarDays, FileText, Pencil } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
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
  const [t, tc, locale, mayWrite, event] = await Promise.all([
    getTranslations("cal"),
    getTranslations("common"),
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

  const range =
    event.startDate === event.endDate
      ? day(event.startDate)
      : `${day(event.startDate)} – ${day(event.endDate)}`;
  return (
    <>
      <RecordHero
        icon={CalendarDays}
        name={event.title}
        subtitle={range}
        breadcrumbs={[{ label: t("title"), href: "/calendar" }, { label: event.title }]}
        actions={
          mayWrite && !closed && <EventStatusActions eventId={event.id} active={event.active} />
        }
        badges={
          <>
            <StatusBadge tone="info" label={t(`type.${event.type}`)} />
            {!event.active && <StatusBadge tone="neutral" label={t("status.cancelled")} />}
          </>
        }
      />
      {closed && (
        <p className="rounded-control border-border bg-muted mb-6 border p-3 text-sm">
          {t("detail.closedNote")}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {event.description && (
            <Card aria-labelledby="cal-description">
              <CardTitle id="cal-description" icon={FileText}>
                {t("form.description")}
              </CardTitle>
              <p className="text-sm whitespace-pre-wrap">{event.description}</p>
            </Card>
          )}
          {mayWrite && !closed && (
            <Card aria-labelledby="edit-title">
              <CardTitle id="edit-title" icon={Pencil}>
                {t("detail.edit")}
              </CardTitle>
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
            </Card>
          )}
        </div>
        <Card aria-labelledby="cal-details">
          <CardTitle id="cal-details" icon={CalendarDays}>
            {tc("details")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              { label: t("detail.when"), value: <span className="font-tabular">{range}</span> },
              {
                label: t("form.audience"),
                value: [
                  t(`audience.${event.audience}`),
                  event.cycle && t(`cycle.${event.cycle}`),
                  event.programName,
                ]
                  .filter(Boolean)
                  .join(" — "),
              },
              {
                label: t("detail.weeksLabel"),
                value:
                  weeks.length > 0
                    ? t("detail.weeks", {
                        weeks: weeks.length > 1 ? `${weeks[0]}–${weeks.at(-1)}` : String(weeks[0]),
                      })
                    : null,
              },
            ]}
          />
        </Card>
      </div>
      {mayWrite && (
        <div className="mt-6">
          <EntityHistory
            entityType="CalendarEvent"
            entityId={event.id}
            permission="cal.event.write"
          />
        </div>
      )}
    </>
  );
}
