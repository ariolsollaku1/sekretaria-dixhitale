import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { env } from "@/lib/env";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";
import type { SearchParams } from "@/lib/tables/types";
import {
  FeedPanel,
  addDays,
  calendarEventsTable,
  hasFeedToken,
  listEvents,
  monthGrid,
  overlaps,
  weeksBetween,
  type EventView,
} from "@/modules/cal";
import { getYear } from "@/modules/org";

const TONE: Record<EventView["type"], StatusTone> = {
  TEACHING_WEEK: "info",
  HOLIDAY: "success",
  DEADLINE: "danger",
  EXAM_PERIOD: "warning",
  REGISTRATION_PERIOD: "info",
  EVENT: "neutral",
};

const VIEWS = ["agenda", "month", "list"] as const;
type View = (typeof VIEWS)[number];

// AC-7/AC-8: the selected year's calendar by week, by month, or as a table.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/calendar");
  const search = await searchParams;
  const [t, locale, mayWrite, yearId] = await Promise.all([
    getTranslations("cal"),
    getLocale(),
    can(user, "cal.event.write"),
    getSelectedAcademicYear(),
  ]);
  const l = locale as Locale;
  const view: View = VIEWS.find((v) => v === search.view) ?? "agenda";
  const year = yearId ? await getYear(yearId) : null;

  const header = (
    <PageHeader
      title={t("title")}
      actions={
        <>
          {mayWrite && year && year.status !== "CLOSED" && (
            <>
              <Link href="/calendar/copy" className={buttonVariants({ variant: "secondary" })}>
                {t("copy.nav")}
              </Link>
              <Link href="/calendar/events/new" className={buttonVariants()}>
                {t("new")}
              </Link>
            </>
          )}
        </>
      }
    />
  );

  if (!year)
    return (
      <>
        {header}
        <EmptyState icon={CalendarDays} title={t("noYear")} description={t("noYearHint")} />
      </>
    );

  const events =
    view === "list"
      ? []
      : await listEvents({ yearId: year.id, viewerId: user.id, includeCancelled: mayWrite });
  const feed = (
    <div className="mt-10">
      <FeedPanel appUrl={env.APP_URL} hasLink={await hasFeedToken(user.id)} />
    </div>
  );
  const day = (d: string) => formatPlainDate(d, l);

  const nav = (
    <nav aria-label={t("views.label")} className="mb-4 flex flex-wrap gap-2">
      {VIEWS.map((v) => (
        <Link
          key={v}
          href={`/calendar?view=${v}`}
          aria-current={v === view ? "page" : undefined}
          className={buttonVariants({ variant: v === view ? "primary" : "secondary" })}
        >
          {t(`views.${v}`)}
        </Link>
      ))}
    </nav>
  );

  const eventLine = (e: EventView) => (
    <li key={e.id} className="flex flex-wrap items-center gap-2">
      <StatusBadge tone={TONE[e.type]} label={t(`type.${e.type}`)} />
      <Link
        href={`/calendar/events/${e.id}`}
        className={`underline ${e.active ? "" : "line-through"}`}
      >
        {e.title}
      </Link>
      <span className="font-tabular text-muted-foreground text-[13px]">
        {e.startDate === e.endDate ? day(e.startDate) : `${day(e.startDate)} – ${day(e.endDate)}`}
      </span>
      {!e.active && <StatusBadge tone="neutral" label={t("status.cancelled")} />}
    </li>
  );

  if (view === "list")
    return (
      <>
        {header}
        {nav}
        <TablePage
          def={calendarEventsTable}
          search={search}
          user={user}
          basePath="/calendar?view=list"
        />
        {feed}
      </>
    );

  if (events.length === 0)
    return (
      <>
        {header}
        {nav}
        <EmptyState icon={CalendarDays} title={t("empty")} description={t("emptyHint")} />
        {feed}
      </>
    );

  if (view === "month") {
    const fallback = new Date().toISOString().slice(0, 7);
    const wanted =
      typeof search.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
        ? search.month
        : null;
    const month =
      wanted ??
      (fallback >= year.startDate.slice(0, 7) && fallback <= year.endDate.slice(0, 7)
        ? fallback
        : year.startDate.slice(0, 7));
    const [yy, mm] = month.split("-").map(Number) as [number, number];
    const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
    const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
    const grid = monthGrid(month);
    const monthName = new Intl.DateTimeFormat(l, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${month}-01T00:00:00Z`));
    const weekdays = grid[0]!.map((d) =>
      new Intl.DateTimeFormat(l, { weekday: "short", timeZone: "UTC" }).format(
        new Date(`${d}T00:00:00Z`),
      ),
    );
    return (
      <>
        {header}
        {nav}
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href={`/calendar?view=month&month=${prev}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("month.prev")}
          </Link>
          <h2 className="text-xl font-semibold capitalize">{monthName}</h2>
          <Link
            href={`/calendar?view=month&month=${next}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("month.next")}
          </Link>
        </div>
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[44rem] table-fixed text-sm">
            <thead>
              <tr className="border-border border-b">
                <th scope="col" className="w-12 p-2 text-left font-semibold">
                  {t("week.short")}
                </th>
                {weekdays.map((w) => (
                  <th key={w} scope="col" className="p-2 text-left font-semibold capitalize">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((week) => (
                <tr key={week[0]} className="border-border border-b align-top last:border-0">
                  <th
                    scope="row"
                    className="font-tabular text-muted-foreground p-2 text-left font-normal"
                  >
                    {weeksBetween(week[0]!, week[0]!, year.startDate)[0]!.number}
                  </th>
                  {week.map((d) => {
                    const todays = events.filter((e) => overlaps(e, d, d));
                    return (
                      <td
                        key={d}
                        className={`p-2 ${d.startsWith(month) ? "" : "bg-muted/50 text-muted-foreground"}`}
                      >
                        <div className="font-tabular font-semibold">{Number(d.slice(8))}</div>
                        <ul className="flex flex-col gap-1">
                          {todays.map((e) => (
                            <li key={e.id}>
                              <Link
                                href={`/calendar/events/${e.id}`}
                                className={`underline ${e.active ? "" : "line-through"}`}
                              >
                                {e.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {feed}
      </>
    );
  }

  // agenda: events grouped by the weeks they span (AC-6/AC-7)
  const firstDay = events[0]!.startDate < year.startDate ? events[0]!.startDate : year.startDate;
  const lastDay = events.reduce((m, e) => (e.endDate > m ? e.endDate : m), year.endDate);
  const weeks = weeksBetween(firstDay, lastDay, year.startDate)
    .map((w) => ({ ...w, events: events.filter((e) => overlaps(e, w.start, w.end)) }))
    .filter((w) => w.events.length > 0);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      {header}
      {nav}
      <ol className="flex flex-col gap-4">
        {weeks.map((w) => (
          <li
            key={w.start}
            className="rounded-card border-border bg-card border p-4"
            aria-current={
              overlaps({ startDate: w.start, endDate: w.end }, today, today) ? "date" : undefined
            }
          >
            <h2 className="mb-2 text-lg font-semibold">
              {t("week.title", { number: w.number })}
              <span className="font-tabular text-muted-foreground text-sm font-normal">
                {" "}
                · {day(w.start)} – {day(addDays(w.start, 6))}
              </span>
            </h2>
            <ul className="flex flex-col gap-2">{w.events.map(eventLine)}</ul>
          </li>
        ))}
      </ol>
      {feed}
    </>
  );
}
