import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatDateTime, formatPlainDate } from "@/lib/i18n/format";
import { formatMinutes } from "../domain/home-rules";
import type { CoursesView, HomeEnrollment, PortalHome } from "../server/home.queries";

const TONE: Record<string, StatusTone> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  DEREGISTERED: "neutral",
  GRADUATED: "info",
};

const card = "rounded-card border-border bg-card border p-4";

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
          <Link href={more.href} className="text-primary text-sm underline underline-offset-2">
            {more.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

async function Courses({ courses }: { courses: CoursesView }) {
  const t = await getTranslations("stu.home");
  if (courses.state !== "ok")
    return <p className="text-muted-foreground text-sm">{t(`courses_${courses.state}`)}</p>;
  if (courses.semesters.length === 0)
    return <p className="text-muted-foreground text-sm">{t("coursesEmpty")}</p>;
  return (
    <div className="flex flex-col gap-3">
      {courses.semesters.map((s) => (
        <div key={s.semester}>
          <h4 className="mb-1 text-sm font-semibold">{t("semester", { number: s.semester })}</h4>
          <ul className="divide-border divide-y text-sm">
            {s.courses.map((c) => (
              <li key={c.id} className="flex justify-between gap-2 py-1">
                <span>
                  <span className="font-tabular text-muted-foreground">{c.code}</span> {c.name}
                  {c.isElective && (
                    <span className="text-muted-foreground"> ({t("elective")})</span>
                  )}
                </span>
                <span className="font-tabular">{t("credits", { n: c.credits })}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-sm font-semibold">{t("creditsTotal", { n: courses.credits })}</p>
    </div>
  );
}

async function Study({ e }: { e: HomeEnrollment }) {
  const [t, ts] = await Promise.all([getTranslations("stu.home"), getTranslations("stu")]);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">
          {e.programCode} — {e.programName}
        </h3>
        <StatusBadge tone={TONE[e.status] ?? "neutral"} label={ts(`status.${e.status}`)} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{ts("columns.cycle")}</dt>
        <dd>{ts(`cycle.${e.cycle}`)}</dd>
        <dt className="text-muted-foreground">{ts("columns.cohort")}</dt>
        <dd>{e.cohortName}</dd>
        <dt className="text-muted-foreground">{ts("columns.yearOfStudy")}</dt>
        <dd>{e.yearOfStudy ? t("yearN", { n: e.yearOfStudy }) : t("noYear")}</dd>
        <dt className="text-muted-foreground">{ts("columns.group")}</dt>
        <dd>{e.groupName ?? t("noYear")}</dd>
      </dl>
    </div>
  );
}

/** The sections of the student's home page (AC-2..AC-7, AC-10). */
export async function PortalHomeView({ home }: { home: PortalHome }) {
  const [t, tn, tt, tcal, locale] = await Promise.all([
    getTranslations("stu.home"),
    getTranslations("shell.nav"),
    getTranslations("cal.timetable"),
    getTranslations("cal"),
    getLocale(),
  ]);
  const loc = locale as "sq" | "en";
  const links = [
    { href: "/stu/me", label: tn("myStudentRecord") },
    { href: "/cal/timetable/mine", label: tn("myTimetable") },
    { href: "/att/absences", label: tn("myAbsences") },
    { href: "/calendar", label: tn("calendar") },
    { href: "/announcements", label: tn("announcements") },
    { href: "/notifications", label: t("notifications") },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <p className="text-muted-foreground font-tabular text-sm">
          {t("studentNumber")}: {home.studentNumber}
          {home.yearCode ? ` · ${t("year", { code: home.yearCode })}` : ""}
        </p>
      </div>

      <Section
        id="h-studies"
        title={t("studies")}
        more={{ href: "/stu/me", label: t("fullRecord") }}
      >
        {home.open.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noOpen")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {home.open.map((e) => (
              <Study key={e.id} e={e} />
            ))}
          </div>
        )}
        {home.closedCount > 0 && (
          <p className="text-muted-foreground mt-3 text-sm">
            {t("closed", { n: home.closedCount })}
          </p>
        )}
        <p className="text-muted-foreground mt-3 text-sm">{t("correction")}</p>
      </Section>

      <Section id="h-shortcuts" title={t("shortcuts")}>
        <ul className="flex flex-col gap-1 text-sm">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-primary underline underline-offset-2">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="h-today"
        title={t("today")}
        more={{ href: "/cal/timetable/mine", label: t("timetable") }}
      >
        {home.classes.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="no-classes">
            {t("noClasses")}
          </p>
        ) : (
          <ul className="divide-border divide-y text-sm" data-testid="classes">
            {home.classes.map((c) => (
              <li key={c.id} className="py-2">
                <span className="font-tabular font-semibold">
                  {formatMinutes(c.startMinute)}–{formatMinutes(c.endMinute)}
                </span>{" "}
                {c.courseCode} {c.courseName}
                <span className="text-muted-foreground">
                  {" · "}
                  {tt(`kind.${c.kind}`)}
                  {c.room ? ` · ${c.room}` : ""}
                  {` · ${c.lecturer}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="h-events" title={t("events")} more={{ href: "/calendar", label: t("calendar") }}>
        {home.events.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noEvents")}</p>
        ) : (
          <ul className="divide-border divide-y text-sm" data-testid="events">
            {home.events.map((e) => (
              <li key={e.id} className="py-2">
                <span className="font-tabular font-semibold">
                  {formatPlainDate(e.startDate, loc)}
                  {e.endDate !== e.startDate ? ` – ${formatPlainDate(e.endDate, loc)}` : ""}
                </span>{" "}
                {e.title}
                <span className="text-muted-foreground"> · {tcal(`type.${e.type}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="h-announcements"
        title={t("announcements")}
        more={{ href: "/announcements", label: t("all") }}
      >
        {home.announcements.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noAnnouncements")}</p>
        ) : (
          <ul className="divide-border divide-y text-sm" data-testid="announcements">
            {home.announcements.map((a) => (
              <li key={a.id} className="py-2">
                <Link
                  href={`/announcements/${a.id}`}
                  className="text-primary font-semibold underline underline-offset-2"
                >
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
        id="h-notifications"
        title={t("notifications")}
        more={{ href: "/notifications", label: t("all") }}
      >
        <p className="mb-2 text-sm" data-testid="unread">
          {t("unread", { n: home.notifications.unread })}
        </p>
        {home.notifications.latest.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noNotifications")}</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {home.notifications.latest.map((n) => (
              <li key={n.id} className="py-2">
                <span className={n.read ? "" : "font-semibold"}>{n.title}</span>
                <span className="text-muted-foreground"> · {formatDateTime(n.createdAt, loc)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {home.open.some((e) => e.status === "ACTIVE") && (
        <div className="lg:col-span-2">
          <Section id="h-courses" title={t("courses")}>
            <div className="flex flex-col gap-6">
              {home.open.map((e) => (
                <div key={e.id}>
                  {home.open.length > 1 && (
                    <h3 className="mb-2 font-semibold">
                      {e.programCode} — {e.programName}
                    </h3>
                  )}
                  <Courses courses={e.courses} />
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

/** Compact "My studies" card for the dashboard (Q-59). */
export async function PortalSummary({ home }: { home: PortalHome | null }) {
  const [t, ts] = await Promise.all([getTranslations("stu.home"), getTranslations("stu")]);
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("studies")}</h2>
      {home === null ? (
        <EmptyState title={t("noRecord")} description={t("noRecordHint")} as="h3" />
      ) : (
        <>
          {home.open.length === 0 && <p className="text-sm">{t("noOpen")}</p>}
          {home.open.map((e) => (
            <p key={e.id} className="text-sm">
              {e.programCode} · {e.cohortName}
              {e.yearOfStudy ? ` · ${t("yearN", { n: e.yearOfStudy })}` : ""}
              {e.groupName ? ` · ${e.groupName}` : ""}{" "}
              <StatusBadge tone={TONE[e.status] ?? "neutral"} label={ts(`status.${e.status}`)} />
            </p>
          ))}
          <p className="text-sm" data-testid="widget-unread">
            {t("unread", { n: home.notifications.unread })}
          </p>
          <Link href="/stu/home" className="text-primary text-sm underline underline-offset-2">
            {t("open")}
          </Link>
        </>
      )}
    </div>
  );
}
