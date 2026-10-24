import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { OwnSummary, ownAbsences, ownSummary } from "@/modules/att";

// ATT-01 AC-10: a student's own absences for the selected year, nothing of anybody else's.
export default async function MyAbsencesPage() {
  const user = await requireUser("/att/absences");
  if (!(await can(user, "att.attendance.self"))) return <ForbiddenView />;
  const [t, yearId] = await Promise.all([getTranslations("att"), getSelectedAcademicYear()]);
  const [rows, summary] = yearId
    ? await Promise.all([ownAbsences(user.id, yearId), ownSummary(user.id, yearId)])
    : [[], null];
  return (
    <>
      <PageHeader title={t("absences.title")} />
      {rows === null ? (
        <EmptyState
          icon={UserX}
          title={t("absences.noStudent")}
          description={t("absences.noStudentHint")}
        />
      ) : (
        <>
          {summary && <OwnSummary courses={summary.courses} threshold={summary.threshold} />}
          {rows.length === 0 ? (
            <p className="rounded-control border-border bg-muted border p-3 text-sm">
              {t("absences.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li
                  key={r.sessionId}
                  className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"
                >
                  <div>
                    <p className="font-tabular font-semibold">
                      <time dateTime={r.date}>{r.date}</time> ·{" "}
                      {t("hoursCount", { count: r.hours })}
                    </p>
                    <p>
                      <span className="font-semibold">{r.courseCode}</span> {r.courseName} ·{" "}
                      {t(`kind.${r.kind}`)}
                    </p>
                  </div>
                  <StatusBadge
                    tone={r.status === "ABSENT" ? "danger" : "info"}
                    label={t(`mark.${r.status}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
