import { FileText } from "lucide-react";
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
import { CarryForwardButton, SyllabusBoard, listSyllabusPlans, syllabusBoard } from "@/modules/cur";
import { getYear } from "@/modules/org";

// AC-8: the courses of a plan with the state of their syllabus in the selected academic year.
export default async function SyllabiPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const user = await requireUser("/cur/syllabi");
  if (!(await can(user, "cur.syllabus.view"))) return <ForbiddenView />;
  const [t, params, yearId, plans] = await Promise.all([
    getTranslations("cur.syllabi"),
    searchParams,
    getSelectedAcademicYear(),
    listSyllabusPlans(user),
  ]);
  const header = <PageHeader title={t("title")} />;
  const year = yearId ? await getYear(yearId) : null;
  if (!year)
    return (
      <>
        {header}
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      </>
    );
  if (plans.length === 0)
    return (
      <>
        {header}
        <EmptyState icon={FileText} title={t("noPlans")} description={t("noPlansHint")} />
      </>
    );
  const plan = plans.find((p) => p.id === params.plan) ?? plans[0]!;
  const data = await syllabusBoard(user, plan.id, year.id);
  const mayWrite =
    !!data && (await can(user, "cur.syllabus.write", { kind: "program", id: data.plan.programId }));
  const editable = mayWrite && year.status !== "CLOSED";
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          editable ? (
            <CarryForwardButton planId={plan.id} yearId={year.id} yearLabel={year.code} />
          ) : undefined
        }
      />
      <p className="text-muted-foreground mb-4 text-sm">{t("forYear", { year: year.code })}</p>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-plan">{t("plan")}</Label>
          <Select id="f-plan" name="plan" defaultValue={plan.id}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.programCode} — {p.programName} · v{p.version} ({p.validFrom})
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          {t("show")}
        </Button>
      </form>
      {data && (
        <>
          <p className="mb-3 text-sm font-semibold">{t("missing", { count: data.missing })}</p>
          <SyllabusBoard rows={data.rows} yearId={year.id} editable={editable} staff={data.staff} />
        </>
      )}
    </>
  );
}
