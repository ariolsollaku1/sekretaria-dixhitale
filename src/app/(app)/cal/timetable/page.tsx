import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { TimetableEditor, TimetableGrid, groupEntries } from "@/modules/cal";
import { listGroupAssignments } from "@/modules/cur";
import { getYear, listGroupsForYear } from "@/modules/org";

// CAL-02 AC-5: a group's weekly timetable; writers also get the editor (AC-4).
export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; date?: string }>;
}) {
  const user = await requireUser("/cal/timetable");
  if (!(await can(user, "cal.timetable.read"))) return <ForbiddenView />;
  const [t, params, yearId, mayWrite] = await Promise.all([
    getTranslations("cal.timetable"),
    searchParams,
    getSelectedAcademicYear(),
    can(user, "cal.timetable.write"),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  const groups = yearId ? await listGroupsForYear(yearId) : [];
  const groupId = groups.some((g) => g.id === params.group) ? params.group! : undefined;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  const entries = groupId ? await groupEntries(groupId) : [];
  const assignments = groupId && mayWrite ? await listGroupAssignments(groupId) : [];
  const editable = mayWrite && year?.status !== "CLOSED";

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            {mayWrite && (
              <Link
                href="/cal/timetable/import"
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("import.nav")}
              </Link>
            )}
            <Link href="/cal/timetable/room" className={buttonVariants({ variant: "secondary" })}>
              {t("roomView")}
            </Link>
          </>
        }
      />
      {!year ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
            <div className="flex min-w-60 flex-col gap-1.5">
              <Label htmlFor="tt-group">{t("group")}</Label>
              <Select id="tt-group" name="group" defaultValue={groupId ?? ""}>
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tt-date">{t("onDate")}</Label>
              <Input id="tt-date" name="date" type="date" defaultValue={date ?? ""} />
            </div>
            <Button type="submit" variant="secondary">
              {t("show")}
            </Button>
          </form>
          {!groupId ? (
            <p className="text-muted-foreground text-sm">
              {groups.length === 0 ? t("noGroups") : t("chooseGroup")}
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              <TimetableGrid entries={entries} onDay={date} />
              {editable && (
                <section aria-labelledby="edit-title">
                  <h2 id="edit-title" className="mb-3 text-2xl font-semibold">
                    {t("edit")}
                  </h2>
                  <TimetableEditor
                    assignments={assignments.map((a) => ({
                      id: a.id,
                      label: `${a.courseCode} · ${t(`kind.${a.kind}`)}`,
                    }))}
                    entries={entries.map((e) => ({
                      id: e.id,
                      weekday: e.weekday,
                      startMinute: e.startMinute,
                      endMinute: e.endMinute,
                      room: e.room,
                      validFrom: e.validFrom,
                      validTo: e.validTo,
                      label: `${e.courseCode} ${t(`kind.${e.kind}`)}`,
                    }))}
                  />
                </section>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
