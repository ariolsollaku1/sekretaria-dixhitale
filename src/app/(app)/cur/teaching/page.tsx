import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { TeachingBoard, TeachingCopy, teachingBoard } from "@/modules/cur";
import { listLecturerOptions } from "@/modules/hr";
import { getYear, listYearOptions } from "@/modules/org";

// AC-6: the board for the selected academic year.
export default async function TeachingPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; semester?: string }>;
}) {
  const user = await requireUser("/cur/teaching");
  if (!(await can(user, "cur.teaching.read"))) return <ForbiddenView />;
  const [t, params, yearId, mayWrite] = await Promise.all([
    getTranslations("cur.teaching"),
    searchParams,
    getSelectedAcademicYear(),
    can(user, "cur.teaching.write"),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  const header = (
    <PageHeader
      title={t("title")}
      actions={
        <Link href="/cur/teaching/list" className={buttonVariants({ variant: "secondary" })}>
          {t("list")}
        </Link>
      }
    />
  );
  if (!year)
    return (
      <>
        {header}
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      </>
    );

  const semester = params.semester === "1" ? 1 : params.semester === "2" ? 2 : undefined;
  const [data, lecturers, years, programs] = await Promise.all([
    teachingBoard(user, { yearId: year.id, programCode: params.program || undefined, semester }),
    mayWrite ? listLecturerOptions() : Promise.resolve([]),
    listYearOptions(),
    db.studyProgram.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { code: true },
    }),
  ]);
  const editable = mayWrite && year.status !== "CLOSED";

  return (
    <>
      {header}
      <p className="text-muted-foreground mb-4 text-sm">{t("forYear", { year: year.code })}</p>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-program">{t("columns.program")}</Label>
          <Select id="f-program" name="program" defaultValue={params.program ?? ""}>
            <option value="">{t("all")}</option>
            {programs.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-semester">{t("columns.semester")}</Label>
          <Select id="f-semester" name="semester" defaultValue={params.semester ?? ""}>
            <option value="">{t("all")}</option>
            <option value="1">{t("semesterN.1")}</option>
            <option value="2">{t("semesterN.2")}</option>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          {t("filter")}
        </Button>
      </form>

      {(data.unassigned.length > 0 || data.overloaded.length > 0) && (
        <section
          aria-labelledby="warn-title"
          className="border-warning/40 bg-warning-bg mb-6 max-w-3xl rounded-md border p-3 text-sm"
        >
          <h2 id="warn-title" className="mb-1 font-semibold">
            {t("warnings")}
          </h2>
          <ul className="flex flex-col gap-1">
            {data.unassigned.length > 0 && (
              <li>{t("warningUnassigned", { count: data.unassigned.length })}</li>
            )}
            {data.overloaded.map((o) => (
              <li key={o.staffId}>
                {t("warningOverloaded", {
                  name: o.name,
                  hours: o.hours,
                  max: data.maxPlannedHours ?? 0,
                })}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editable && (
        <div className="mb-6">
          <TeachingCopy
            toYearId={year.id}
            toLabel={year.code}
            sources={years.filter((y) => y.id !== year.id)}
          />
        </div>
      )}
      <TeachingBoard groups={data.groups} lecturers={lecturers} canWrite={editable} />
    </>
  );
}
