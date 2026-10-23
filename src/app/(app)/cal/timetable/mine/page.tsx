import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { TimetableGrid, staffEntries, studentEntries } from "@/modules/cal";

// AC-5: a lecturer's (or a student's) own timetable for the selected year.
export default async function MyTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser("/cal/timetable/mine");
  if (!(await can(user, "cal.timetable.self"))) return <ForbiddenView />;
  const [t, params, yearId] = await Promise.all([
    getTranslations("cal.timetable"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  const asStaff = yearId ? await staffEntries(user.id, yearId) : null;
  const asStudent = yearId && asStaff === null ? await studentEntries(user.id, yearId) : null;
  const entries = asStaff ?? asStudent;
  return (
    <>
      <PageHeader title={t("mine")} />
      {entries === null ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noRecord")}</p>
      ) : (
        <TimetableGrid
          entries={entries}
          onDay={date}
          showGroup={asStaff !== null}
          showLecturer={asStaff === null}
        />
      )}
    </>
  );
}
