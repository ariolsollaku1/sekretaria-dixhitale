import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { RecordHero } from "@/components/record/record-hero";
import { RecordTabs } from "@/components/record/record-tabs";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { AccountPanel, getAccountPanel } from "@/modules/iam";
import { getStudent } from "@/modules/stu";
import { listYearOptions } from "@/modules/org";
import {
  EnrollmentsSection,
  HistorySection,
  PersonalSection,
  YearsSection,
} from "../../student-sections";

const ENROLLMENT_TONE: Record<string, StatusTone> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  DEREGISTERED: "neutral",
  GRADUATED: "info",
};
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
  const [t, query, mayWrite, data, years, mayAccount] = await Promise.all([
    getTranslations("stu"),
    searchParams,
    can(user, "stu.student.write"),
    getStudent(user, id),
    listYearOptions(),
    can(user, "iam.account.student"),
  ]);
  if (!data) notFound(); // outside the user's programs = does not exist
  const tab = TABS.find((x) => x === query.tab) ?? "personal";
  const { student, enrollments } = data;
  // IAM-02 AC-9: the account state is shown to those who may manage student accounts
  const account = mayAccount ? await getAccountPanel(student.personId) : null;
  const name = `${student.firstName} ${student.lastName}`;
  const current = enrollments[0];
  return (
    <>
      <RecordHero
        name={name}
        subtitle={[student.studentNumber, current?.program.code].filter(Boolean).join(" · ")}
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
        badges={
          current && (
            <StatusBadge
              tone={ENROLLMENT_TONE[current.status] ?? "neutral"}
              label={t(`status.${current.status}`)}
            />
          )
        }
      />
      <RecordTabs
        label={t("tabs.label")}
        basePath={`/stu/students/${student.id}`}
        tabs={TABS.map((x) => ({ key: x, label: t(`tabs.${x}`) }))}
        active={tab}
      />
      {tab === "personal" && (
        <PersonalSection
          student={student}
          aside={
            account && (
              <AccountPanel
                kind="STUDENT"
                studentId={student.id}
                state={account.state}
                email={account.email}
                canManage
              />
            )
          }
        />
      )}
      {tab === "enrollments" && (
        <EnrollmentsSection studentId={student.id} enrollments={enrollments} canWrite={mayWrite} />
      )}
      {tab === "years" && (
        <YearsSection enrollments={enrollments} canWrite={mayWrite} years={years} />
      )}
      {tab === "history" && <HistorySection enrollments={enrollments} />}
      {mayWrite && (
        <div className="mt-6">
          <EntityHistory
            entityType="Student"
            entityId={student.id}
            permission="stu.student.write"
          />
        </div>
      )}
    </>
  );
}
