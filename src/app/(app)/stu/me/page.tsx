import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getOwnStudent } from "@/modules/stu";
import {
  EnrollmentsSection,
  HistorySection,
  PersonalSection,
  YearsSection,
} from "../student-sections";

// AC-11: a student sees their own record and nothing else.
export default async function MyStudentRecordPage() {
  const user = await requireUser("/stu/me");
  const [t, data] = await Promise.all([getTranslations("stu"), getOwnStudent(user)]);
  return (
    <>
      <PageHeader title={t("me.title")} />
      {data ? (
        <div className="flex flex-col gap-8">
          <p className="text-muted-foreground font-tabular text-sm">
            {t("form.studentNumber")}: {data.student.studentNumber}
          </p>
          <PersonalSection student={data.student} />
          <section aria-labelledby="my-enr">
            <h2 id="my-enr" className="mb-3 text-2xl font-semibold">
              {t("tabs.enrollments")}
            </h2>
            <EnrollmentsSection
              studentId={data.student.id}
              enrollments={data.enrollments}
              canWrite={false}
            />
          </section>
          <section aria-labelledby="my-years">
            <h2 id="my-years" className="mb-3 text-2xl font-semibold">
              {t("tabs.years")}
            </h2>
            <YearsSection enrollments={data.enrollments} canWrite={false} years={[]} />
          </section>
          <section aria-labelledby="my-hist">
            <h2 id="my-hist" className="mb-3 text-2xl font-semibold">
              {t("tabs.history")}
            </h2>
            <HistorySection enrollments={data.enrollments} />
          </section>
        </div>
      ) : (
        <EmptyState icon={UserX} title={t("me.none")} description={t("me.noneHint")} />
      )}
    </>
  );
}
