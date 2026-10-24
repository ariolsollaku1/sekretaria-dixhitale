import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
  const [t, tn, locale, manage, mine, mayRegister] = await Promise.all([
    getTranslations("evt"),
    getTranslations("ntf"),
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
      <PageHeader
        title={e.title}
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
            {mayRegister && (
              <RegisterButton
                eventId={e.id}
                registered={registered}
                canRegister={state === "open"}
                canCancel={mayUnregister(e, now)}
              />
            )}
          </>
        }
      />
      <p className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        {(manage || e.status === "CANCELLED") && (
          <StatusBadge tone={TONE[e.status]!} label={t(`status.${e.status}`)} />
        )}
        {registered && <StatusBadge tone="success" label={t("registered")} />}
        {manage && (
          <span className="text-muted-foreground">
            {tn(`audience.${e.audience}`)}
            {e.cycle && ` — ${tn(`cycle.${e.cycle}`)}`}
            {e.programName && ` — ${e.programName}`}
          </span>
        )}
      </p>
      <dl className="rounded-card border-border bg-card mb-4 grid max-w-3xl gap-x-6 gap-y-2 border p-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">{t("when")}</dt>
        <dd className="font-tabular">
          {formatDateTime(e.startsAt, l)}
          {e.endsAt && ` – ${formatDateTime(e.endsAt, l)}`}
        </dd>
        <dt className="font-semibold">{t("where")}</dt>
        <dd>{e.location}</dd>
        <dt className="font-semibold">{t("places")}</dt>
        <dd>
          {left === null ? t("unlimited") : t("placesLeft", { count: left })}
          {manage && ` (${t("registeredCount", { count: e.registeredCount })})`}
        </dd>
        {e.registrationDeadline && (
          <>
            <dt className="font-semibold">{t("deadline")}</dt>
            <dd className="font-tabular">{formatDateTime(e.registrationDeadline, l)}</dd>
          </>
        )}
        {e.announcementId && e.announcementTitle && (
          <>
            <dt className="font-semibold">{t("announcement")}</dt>
            <dd>
              <Link href={`/announcements/${e.announcementId}`} className="underline">
                {e.announcementTitle}
              </Link>
            </dd>
          </>
        )}
      </dl>
      <p role="status" className="mb-4 text-sm font-semibold">
        {registered && state !== "cancelled" ? t("youAreRegistered") : t(`state.${state}`)}
      </p>
      <div className="rounded-card border-border bg-card mb-6 max-w-3xl border p-4 text-sm whitespace-pre-line">
        {e.description}
      </div>
      {manage && <EntityHistory entityType="Event" entityId={e.id} permission="ntf.event.write" />}
    </>
  );
}
