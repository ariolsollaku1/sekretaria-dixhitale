import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  SessionForms,
  SessionList,
  addDays,
  clampDay,
  ownSessions,
  todayInTirane,
} from "@/modules/att";
import { ownAssignments } from "@/modules/cur";
import { getYear } from "@/modules/org";

// ATT-01 AC-2, AC-3, AC-9: the lecturer's own classes of the selected year.
export default async function MyAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ assignment?: string }>;
}) {
  const user = await requireUser("/att/mine");
  if (!(await can(user, "att.attendance.record"))) return <ForbiddenView />;
  const [t, params, yearId] = await Promise.all([
    getTranslations("att"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  const assignments = yearId ? await ownAssignments(user, yearId) : [];
  if (assignments === null)
    return (
      <>
        <PageHeader title={t("mine.title")} />
        <EmptyState icon={UserX} title={t("mine.noStaff")} description={t("mine.noStaffHint")} />
      </>
    );
  const options = assignments.map((a) => ({
    id: a.id,
    label: `${a.course} · ${t(`kind.${a.kind}`)} · ${a.group}`,
  }));
  const assignmentId = options.some((o) => o.id === params.assignment)
    ? params.assignment
    : undefined;
  const sessions = (yearId && (await ownSessions(user.id, yearId, assignmentId))) || [];
  const today = todayInTirane();
  const bounds = year ?? { startDate: today, endDate: today };
  return (
    <>
      <PageHeader title={t("mine.title")} />
      {!year ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      ) : (
        <div className="flex flex-col gap-8">
          <SessionForms
            mode="record"
            assignments={options}
            defaultFrom={clampDay(addDays(today, -6), bounds)}
            defaultTo={clampDay(addDays(today, 7), bounds)}
            today={clampDay(today, bounds)}
          />
          <section aria-labelledby="sessions-title">
            <h2 id="sessions-title" className="mb-3 text-2xl font-semibold">
              {t("sessions")}
            </h2>
            <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
              <div className="flex min-w-60 flex-col gap-1.5">
                <Label htmlFor="f-assignment">{t("form.assignment")}</Label>
                <Select id="f-assignment" name="assignment" defaultValue={assignmentId ?? ""}>
                  <option value="">{t("all")}</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="secondary">
                {t("show")}
              </Button>
            </form>
            <SessionList sessions={sessions} />
          </section>
        </div>
      )}
    </>
  );
}
