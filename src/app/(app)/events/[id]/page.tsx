import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { buttonVariants } from "@/components/ui/button";
import { CalendarDays, FileText, Ticket } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import {
  EventStatusActions,
  RegisterButton,
  mayManageEvent,
  mayUnregister,
  myRegistration,
  placesLeft,
  registrationState,
  visibleEvent,
} from "@/modules/ntf";

const TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  CANCELLED: "warning",
};

// AC-3/AC-4: an event the user may not see is a 404.
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/events/${id}`);
  const e = await visibleEvent(user.id, id);
  if (!e) notFound();
  const [t, tn, tc, locale, manage, mine, mayRegister] = await Promise.all([
    getTranslations("evt"),
    getTranslations("ntf"),
    getTranslations("common"),
    getLocale(),
    mayManageEvent(user, e),
    myRegistration(user.id, id),
    can(user, "ntf.event.register"),
  ]);
  const l = locale as Locale;
  const now = new Date();
  const state = registrationState(e, e.registeredCount, now);
  const registered = mine?.status === "REGISTERED";
  const left = placesLeft(e.capacity, e.registeredCount);

  return (
    <>
      <RecordHero
        icon={CalendarDays}
        name={e.title}
        subtitle={[formatDateTime(e.startsAt, l), e.location].filter(Boolean).join(" · ")}
        breadcrumbs={[{ label: t("title"), href: "/events" }, { label: e.title }]}
        actions={
          <>
            {manage && e.status !== "CANCELLED" && (
              <Link
                href={`/events/${e.id}/edit`}
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("edit")}
              </Link>
            )}
            {manage && (
              <Link
                href={`/events/attendees?event=${e.id}`}
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("attendees")}
              </Link>
            )}
            {manage && <EventStatusActions eventId={e.id} status={e.status} />}
          </>
        }
        badges={
          <>
            {(manage || e.status === "CANCELLED") && (
              <StatusBadge tone={TONE[e.status]!} label={t(`status.${e.status}`)} />
            )}
            {registered && <StatusBadge tone="success" label={t("registered")} />}
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card aria-labelledby="evt-description">
          <CardTitle id="evt-description" icon={FileText}>
            {tc("details")}
          </CardTitle>
          <p className="text-sm whitespace-pre-line">{e.description}</p>
        </Card>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="evt-info">
            <CardTitle id="evt-info" icon={CalendarDays}>
              {t("when")}
            </CardTitle>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                {
                  label: t("when"),
                  value: (
                    <span className="font-tabular">
                      {formatDateTime(e.startsAt, l)}
                      {e.endsAt && ` – ${formatDateTime(e.endsAt, l)}`}
                    </span>
                  ),
                },
                { label: t("where"), value: e.location },
                {
                  label: t("places"),
                  value: `${left === null ? t("unlimited") : t("placesLeft", { count: left })}${
                    manage ? ` (${t("registeredCount", { count: e.registeredCount })})` : ""
                  }`,
                },
                {
                  label: t("deadline"),
                  value: e.registrationDeadline && (
                    <span className="font-tabular">
                      {formatDateTime(e.registrationDeadline, l)}
                    </span>
                  ),
                },
                {
                  label: t("announcement"),
                  value: e.announcementId && e.announcementTitle && (
                    <Link href={`/announcements/${e.announcementId}`} className="underline">
                      {e.announcementTitle}
                    </Link>
                  ),
                },
                {
                  label: tn("audience.label"),
                  value: manage
                    ? [
                        tn(`audience.${e.audience}`),
                        e.cycle && tn(`cycle.${e.cycle}`),
                        e.programName,
                      ]
                        .filter(Boolean)
                        .join(" — ")
                    : null,
                },
              ]}
            />
          </Card>
          <Card aria-labelledby="evt-registration">
            <CardTitle id="evt-registration" icon={Ticket}>
              {t("registration")}
            </CardTitle>
            <p role="status" className="mb-4 text-sm font-semibold">
              {registered && state !== "cancelled" ? t("youAreRegistered") : t(`state.${state}`)}
            </p>
            {mayRegister && (
              <RegisterButton
                eventId={e.id}
                registered={registered}
                canRegister={state === "open"}
                canCancel={mayUnregister(e, now)}
              />
            )}
          </Card>
        </div>
      </div>
      {manage && (
        <div className="mt-6">
          <EntityHistory entityType="Event" entityId={e.id} permission="ntf.event.write" />
        </div>
      )}
    </>
  );
}
