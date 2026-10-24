import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { BookCheck, UserRound } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
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
      <RecordHero
        icon={BookCheck}
        name={t("title")}
        subtitle={panel.reference}
        breadcrumbs={[
          { label: t("inbox"), href: "/forms/inbox" },
          { label: panel.reference, href: `/forms/inbox/${panel.submissionId}` },
          { label: t("title") },
        ]}
        badges={panel.closed && <StatusBadge tone="neutral" label={t("closedBadge")} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card aria-labelledby="req-courses">
          <CardTitle id="req-courses" icon={BookCheck}>
            {t("courses")}
          </CardTitle>
          {panel.closed && <p className="text-muted-foreground mb-3 text-sm">{t("closed")}</p>}
          <RecognitionPanelView
            submissionId={panel.submissionId}
            courses={panel.courses}
            canWrite={canWrite}
            closed={panel.closed}
            ready={ready}
          />
        </Card>
        <Card aria-labelledby="req-who">
          <CardTitle id="req-who" icon={UserRound}>
            {t("requester")}
          </CardTitle>
          {identified && (
            <InfoList
              className="sm:grid-cols-1"
              items={[
                {
                  label: t("student"),
                  value: (
                    <Link className="underline" href={`/stu/students/${requester.studentId}`}>
                      {requester.name}
                    </Link>
                  ),
                },
                {
                  label: t("studentNumber"),
                  value: <span className="font-tabular">{requester.studentNumber}</span>,
                },
                { label: t("program"), value: requester.enrollment?.programCode },
              ]}
            />
          )}
          {problem && (
            <p role="alert" className="text-danger mt-3 text-sm font-semibold">
              {t.has(`errors.${problem}` as never)
                ? t(`errors.${problem}` as never)
                : t("errors.generic")}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
