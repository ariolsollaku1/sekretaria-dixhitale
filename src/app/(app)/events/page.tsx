import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { listEvents, placesLeft, type ListedEvent } from "@/modules/ntf";

// AC-3: the events open to the signed-in user, upcoming first, then past ones.
export default async function EventsPage() {
  const user = await requireUser("/events");
  const [t, locale, mayWrite] = await Promise.all([
    getTranslations("evt"),
    getLocale(),
    can(user, "ntf.event.write"),
  ]);
  const l = locale as Locale;
  const { upcoming, past } = await listEvents(user.id);

  const card = (e: ListedEvent) => {
    const left = placesLeft(e.capacity, e.registeredCount);
    return (
      <li key={e.id} className="rounded-card border-border bg-card border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">
            <Link href={`/events/${e.id}`} className="underline">
              {e.title}
            </Link>
          </h3>
          {e.status === "CANCELLED" && <StatusBadge tone="warning" label={t("status.CANCELLED")} />}
          {e.myStatus === "REGISTERED" && <StatusBadge tone="success" label={t("registered")} />}
          <time
            dateTime={e.startsAt.toISOString()}
            className="font-tabular text-muted-foreground ml-auto text-[13px]"
          >
            {formatDateTime(e.startsAt, l)}
          </time>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {e.location}
          {left !== null && ` — ${t("placesLeft", { count: left })}`}
        </p>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <>
              <Link href="/events/manage" className={buttonVariants({ variant: "secondary" })}>
                {t("manage")}
              </Link>
              <Link href="/events/new" className={buttonVariants()}>
                {t("new")}
              </Link>
            </>
          )
        }
      />
      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <>
          <section aria-labelledby="upcoming-title" className="mb-8">
            <h2 id="upcoming-title" className="mb-3 text-xl font-semibold">
              {t("upcoming")}
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noUpcoming")}</p>
            ) : (
              <ol className="flex flex-col gap-3">{upcoming.map(card)}</ol>
            )}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-title">
              <h2 id="past-title" className="mb-3 text-xl font-semibold">
                {t("past")}
              </h2>
              <ol className="flex flex-col gap-3">{past.map(card)}</ol>
            </section>
          )}
        </>
      )}
    </>
  );
}
