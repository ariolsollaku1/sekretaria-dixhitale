import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/i18n/format";
import type { TeachingHub } from "../server/teaching.queries";

const card = "rounded-card border-border bg-card border p-4";
const link = "text-primary underline underline-offset-2";

const time = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function Section({
  id,
  title,
  children,
  more,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  more?: { href: string; label: string };
}) {
  return (
    <section aria-labelledby={id} className={card}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {more && (
          <Link href={more.href} className={`${link} text-sm`}>
            {more.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** The sections of the lecturer's hub (AC-2..AC-5, AC-7). */
export async function TeachingHubView({ hub }: { hub: TeachingHub }) {
  const [t, tn, tk, tt, locale] = await Promise.all([
    getTranslations("hr.workspace"),
    getTranslations("shell.nav"),
    getTranslations("cur.teaching"),
    getTranslations("cal.timetable"),
    getLocale(),
  ]);
  const loc = locale as "sq" | "en";
  const links = [
    { href: "/att/mine", label: tn("myAttendance") },
    { href: "/cal/timetable/mine", label: tn("myTimetable") },
    { href: "/cur/teaching/mine", label: tn("myTeaching") },
    { href: "/calendar", label: tn("calendar") },
    { href: "/announcements", label: tn("announcements") },
    { href: "/notifications", label: t("notifications") },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <Section id="w-assignments" title={t("assignments")}>
          {hub.assignmentCount === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="no-assignments">
              {t("noAssignments")}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {hub.semesters.map((g) => (
                <div key={g.semester}>
                  <h3 className="mb-1 text-sm font-semibold">
                    {t("semester", { number: g.semester })}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[44rem] text-sm" data-testid="assignments">
                      <thead>
                        <tr className="border-border border-b text-left">
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            {tk("columns.course")}
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            {tk("columns.kind")}
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            {tk("columns.group")}
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            {t("students")}
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            {t("attendance")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={r.id} className="border-border border-b last:border-0">
                            <th scope="row" className="py-2 pr-3 text-left font-normal">
                              {r.course}
                            </th>
                            <td className="py-2 pr-3">{tk(`kind.${r.kind}`)}</td>
                            <td className="py-2 pr-3">{r.group}</td>
                            <td className="font-tabular py-2 pr-3">
                              {r.students}{" "}
                              <Link href={`/hr/teaching/${r.id}`} className={link}>
                                {t("roster")}
                              </Link>
                            </td>
                            <td className="py-2 pr-3">
                              <span className="font-tabular">
                                {t("progress", {
                                  held: r.progress.held,
                                  pending: r.progress.pending,
                                  absences: r.progress.absences,
                                })}
                              </span>{" "}
                              <Link href={`/att/mine?assignment=${r.id}`} className={link}>
                                {t("record")}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-muted-foreground mt-3 text-sm">{t("gradesLater")}</p>
        </Section>
      </div>

      <Section
        id="w-today"
        title={t("today")}
        more={{ href: "/cal/timetable/mine", label: t("timetable") }}
      >
        {hub.classes.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="no-classes">
            {t("noClasses")}
          </p>
        ) : (
          <ul className="divide-border divide-y text-sm" data-testid="classes">
            {hub.classes.map((c) => (
              <li key={c.id} className="py-2">
                <span className="font-tabular font-semibold">
                  {time(c.startMinute)}–{time(c.endMinute)}
                </span>{" "}
                {c.courseCode} {c.courseName}
                <span className="text-muted-foreground">
                  {" · "}
                  {tt(`kind.${c.kind}`)}
                  {c.room ? ` · ${c.room}` : ""}
                  {` · ${c.groupLabel}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="w-shortcuts" title={t("shortcuts")}>
        <ul className="flex flex-col gap-1 text-sm">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={link}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="w-announcements"
        title={t("announcements")}
        more={{ href: "/announcements", label: t("all") }}
      >
        {hub.announcements.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noAnnouncements")}</p>
        ) : (
          <ul className="divide-border divide-y text-sm" data-testid="announcements">
            {hub.announcements.map((a) => (
              <li key={a.id} className="py-2">
                <Link href={`/announcements/${a.id}`} className={`${link} font-semibold`}>
                  {a.title}
                </Link>
                {a.publishAt && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatDateTime(a.publishAt, loc)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="w-notifications"
        title={t("notifications")}
        more={{ href: "/notifications", label: t("all") }}
      >
        <p className="mb-2 text-sm" data-testid="unread">
          {t("unread", { n: hub.notifications.unread })}
        </p>
        {hub.notifications.latest.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noNotifications")}</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {hub.notifications.latest.map((n) => (
              <li key={n.id} className="py-2">
                <span className={n.read ? "" : "font-semibold"}>{n.title}</span>
                <span className="text-muted-foreground"> · {formatDateTime(n.createdAt, loc)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** Compact "My teaching" card for the dashboard (Q-84). */
export async function TeachingSummary({ hub }: { hub: TeachingHub | null }) {
  const t = await getTranslations("hr.workspace");
  const pending = hub?.semesters.flatMap((g) => g.rows).reduce((n, r) => n + r.progress.pending, 0);
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("widgetTitle")}</h2>
      {hub === null ? (
        <EmptyState title={t("noStaff")} description={t("noStaffHint")} as="h3" />
      ) : (
        <>
          <p className="text-sm" data-testid="widget-assignments">
            {t("widgetAssignments", { n: hub.assignmentCount })}
          </p>
          <p className="text-sm">{t("widgetClasses", { n: hub.classes.length })}</p>
          <p className="text-sm">{t("widgetPending", { n: pending ?? 0 })}</p>
          <Link href="/hr/teaching" className={`${link} text-sm`}>
            {t("open")}
          </Link>
        </>
      )}
    </div>
  );
}
