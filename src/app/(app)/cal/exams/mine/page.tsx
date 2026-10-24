import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { ExamSchedule, myExams } from "@/modules/cal";

// CAL-03 AC-8: a student's (or an examiner's) published exams for the selected year.
export default async function MyExamsPage() {
  const user = await requireUser("/cal/exams/mine");
  if (!(await can(user, "cal.exam.self"))) return <ForbiddenView />;
  const [t, yearId] = await Promise.all([getTranslations("cal.exams"), getSelectedAcademicYear()]);
  const sittings = yearId ? await myExams(user.id, yearId) : [];
  return (
    <>
      <PageHeader title={t("mine")} />
      <ExamSchedule sittings={sittings} showSession />
    </>
  );
}
