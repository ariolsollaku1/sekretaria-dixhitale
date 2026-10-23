import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { getStudent } from "@/modules/stu";
import { listYearOptions } from "@/modules/org";
import {
  EnrollmentsSection,
  HistorySection,
  PersonalSection,
  YearsSection,
} from "../../student-sections";

const TABS = ["personal", "enrollments", "years", "history"] as const;

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/stu/students/${id}`);
  if (!(await can(user, "stu.student.read"))) return <ForbiddenView />;
  const [t, query, mayWrite, data, years] = await Promise.all([
    getTranslations("stu"),
    searchParams,
    can(user, "stu.student.write"),
    getStudent(user, id),
    listYearOptions(),
  ]);
  if (!data) notFound(); // outside the user's programs = does not exist
  const tab = TABS.find((x) => x === query.tab) ?? "personal";
  const { student, enrollments } = data;
  const name = `${student.firstName} ${student.lastName}`;
  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={[{ label: t("title"), href: "/stu/students" }, { label: name }]}
        actions={
          mayWrite && (
            <Link
              href={`/stu/students/${student.id}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("edit")}
            </Link>
          )
        }
      />
      <p className="text-muted-foreground font-tabular mb-4 text-sm">
        {t("form.studentNumber")}: {student.studentNumber}
      </p>
      <nav aria-label={t("tabs.label")} className="mb-6 flex flex-wrap gap-2 print:hidden">
        {TABS.map((x) => (
          <Link
            key={x}
            href={`/stu/students/${student.id}?tab=${x}`}
            aria-current={x === tab ? "page" : undefined}
            className={buttonVariants({ variant: x === tab ? "primary" : "secondary" })}
          >
            {t(`tabs.${x}`)}
          </Link>
        ))}
      </nav>
      {tab === "personal" && <PersonalSection student={student} />}
      {tab === "enrollments" && (
        <EnrollmentsSection studentId={student.id} enrollments={enrollments} canWrite={mayWrite} />
      )}
      {tab === "years" && (
        <YearsSection enrollments={enrollments} canWrite={mayWrite} years={years} />
      )}
      {tab === "history" && <HistorySection enrollments={enrollments} />}
      {mayWrite && (
        <EntityHistory entityType="Student" entityId={student.id} permission="stu.student.write" />
      )}
    </>
  );
}
