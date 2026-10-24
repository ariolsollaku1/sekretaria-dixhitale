import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { getRecognitionPanel, RecognitionPanelView } from "@/modules/stu";

// STU-07 AC-8, AC-9: the decision on a recognition request (recognized courses and credits).
export default async function RecognitionDecisionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const user = await requireUser(`/stu/requests/${submissionId}`);
  if (!(await can(user, "stu.recognition.read"))) return <ForbiddenView />;
  const panel = await getRecognitionPanel(user, submissionId);
  if (!panel) notFound(); // not a recognition request of a form you handle = does not exist
  const [t, canWrite] = await Promise.all([
    getTranslations("stu.requests"),
    can(user, "stu.recognition.write"),
  ]);
  const requester = panel.requester;
  const identified = "studentId" in requester;
  const problem = requester.problem;
  const ready = identified && !requester.problem;

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbs={[
          { label: t("inbox"), href: "/forms/inbox" },
          { label: panel.reference, href: `/forms/inbox/${panel.submissionId}` },
          { label: t("title") },
        ]}
      />
      <section aria-labelledby="req-who" className="mb-8">
        <h2 id="req-who" className="mb-3 text-2xl font-semibold">
          {t("requester")}
        </h2>
        {identified ? (
          <dl className="grid max-w-2xl gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
            <dt className="font-semibold">{t("student")}</dt>
            <dd>
              <Link className="underline" href={`/stu/students/${requester.studentId}`}>
                {requester.name}
              </Link>
            </dd>
            <dt className="font-semibold">{t("studentNumber")}</dt>
            <dd className="font-tabular">{requester.studentNumber}</dd>
            <dt className="font-semibold">{t("program")}</dt>
            <dd>{requester.enrollment?.programCode ?? "—"}</dd>
          </dl>
        ) : null}
        {problem && (
          <p role="alert" className="text-destructive mt-3 max-w-2xl text-sm">
            {t.has(`errors.${problem}` as never)
              ? t(`errors.${problem}` as never)
              : t("errors.generic")}
          </p>
        )}
      </section>
      <section aria-labelledby="req-courses" className="mb-8">
        <h2 id="req-courses" className="mb-3 text-2xl font-semibold">
          {t("courses")}
        </h2>
        {panel.closed && <p className="text-muted-foreground mb-3 text-sm">{t("closed")}</p>}
        <RecognitionPanelView
          submissionId={panel.submissionId}
          courses={panel.courses}
          canWrite={canWrite}
          closed={panel.closed}
          ready={ready}
        />
      </section>
    </>
  );
}
