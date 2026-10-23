import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
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
  groupSessions,
  todayInTirane,
} from "@/modules/att";
import { listGroupAssignments } from "@/modules/cur";
import { getYear, listGroupsForYear } from "@/modules/org";

// ATT-01 AC-9: a group's sessions for the Secretariat, heads and coordinators (within their scope).
export default async function GroupSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const user = await requireUser("/att/sessions");
  const [mayRead, mayCorrect] = await Promise.all([
    can(user, "att.attendance.read"),
    can(user, "att.attendance.correct"),
  ]);
  if (!mayRead && !mayCorrect) return <ForbiddenView />;
  const [t, params, yearId] = await Promise.all([
    getTranslations("att"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  const groups = yearId ? await listGroupsForYear(yearId) : [];
  const groupId = groups.some((g) => g.id === params.group) ? params.group! : undefined;
  const sessions = groupId ? await groupSessions(user, groupId) : null;
  const editable =
    !!groupId &&
    year?.status !== "CLOSED" &&
    (await can(user, "att.attendance.correct", { kind: "group", id: groupId }));
  const assignments = editable && groupId ? await listGroupAssignments(groupId) : [];
  const today = todayInTirane();
  const bounds = year ?? { startDate: today, endDate: today };
  return (
    <>
      <PageHeader title={t("sessionsTitle")} />
      {!year ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
            <div className="flex min-w-60 flex-col gap-1.5">
              <Label htmlFor="att-group">{t("group")}</Label>
              <Select id="att-group" name="group" defaultValue={groupId ?? ""}>
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              {t("show")}
            </Button>
          </form>
          {!groupId ? (
            <p className="text-muted-foreground text-sm">
              {groups.length === 0 ? t("noGroups") : t("chooseGroup")}
            </p>
          ) : sessions === null ? (
            <ForbiddenView />
          ) : (
            <div className="flex flex-col gap-8">
              {editable && (
                <SessionForms
                  mode="correct"
                  assignments={assignments.map((a) => ({
                    id: a.id,
                    label: `${a.courseCode} · ${t(`kind.${a.kind}`)}`,
                  }))}
                  defaultFrom={clampDay(addDays(today, -6), bounds)}
                  defaultTo={clampDay(addDays(today, 7), bounds)}
                  today={clampDay(today, bounds)}
                />
              )}
              <SessionList sessions={sessions} showLecturer />
            </div>
          )}
        </>
      )}
    </>
  );
}
