import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";
import {
  ExamSchedule,
  ExamSessionPanel,
  ExamSittingEditor,
  getSession,
  sessionSittings,
} from "@/modules/cal";
import { listExamCourses } from "@/modules/cur";
import { listLecturerOptions } from "@/modules/hr";
import { getYear } from "@/modules/org";

// CAL-03 AC-6..AC-8: one session's schedule; the Secretariat also gets the editor and publication.
export default async function ExamSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/cal/exams/${sessionId}`);
  if (!(await can(user, "cal.exam.read"))) return <ForbiddenView />;
  const [t, locale, mayWrite, session] = await Promise.all([
    getTranslations("cal.exams"),
    getLocale(),
    can(user, "cal.exam.write"),
    getSession(sessionId),
  ]);
  if (!session) notFound();
  const [year, sittings] = await Promise.all([
    getYear(session.academicYearId),
    sessionSittings(sessionId),
  ]);
  const editable = mayWrite && year?.status !== "CLOSED";
  const [courses, staff] = editable
    ? await Promise.all([listExamCourses(session.academicYearId), listLecturerOptions()])
    : [[], []];
  const day = (d: string) => formatPlainDate(d, locale as Locale);
  const title = t(`type.${session.type}`);
  const eligible =
    session.type === "MINI" ? courses.filter((c) => c.yearOfStudy === c.durationYears) : courses;

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("title"), href: "/cal/exams" }, { label: title }]}
      />
      <p className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-tabular">
          {day(session.startDate)} – {day(session.endDate)}
        </span>
        <StatusBadge
          tone={session.published ? "success" : "neutral"}
          label={t(session.published ? "status.published" : "status.draft")}
        />
        {session.type === "MINI" && <span className="text-muted-foreground">{t("miniNote")}</span>}
      </p>
      {year?.status === "CLOSED" && (
        <p className="rounded-control border-border bg-muted mb-6 border p-3 text-sm">
          {t("closedNote")}
        </p>
      )}
      {editable && (
        <>
          <ExamSessionPanel
            sessionId={session.id}
            startDate={session.startDate}
            endDate={session.endDate}
            published={session.published}
          />
          <ExamSittingEditor
            sessionId={session.id}
            courses={eligible.map((c) => ({
              id: c.id,
              label: `${c.programCode} · ${c.courseCode} ${c.courseName} (${t("yearOfStudy", { year: c.yearOfStudy })})`,
            }))}
            staff={staff.map((s) => ({ id: s.id, label: s.label }))}
            sittings={sittings.map((s) => ({
              id: s.id,
              planCourseId: s.planCourseId,
              date: s.date,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
              room: s.room,
              note: s.note,
              examinerIds: s.examinerIds as string[],
              label: s.label,
            }))}
            defaultDate={session.startDate}
          />
        </>
      )}
      <section aria-labelledby="schedule-title" className="mt-8">
        <h2 id="schedule-title" className="mb-3 text-2xl font-semibold">
          {t("schedule")}
        </h2>
        <ExamSchedule sittings={sittings} />
      </section>
    </>
  );
}
