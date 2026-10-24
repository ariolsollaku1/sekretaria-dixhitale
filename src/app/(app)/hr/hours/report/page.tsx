import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { courseRows, hoursReportTable, totalsByCategory } from "@/modules/hr";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// HR-04 AC-4: delivered hours per course with the totals of the filtered rows per category.
export default async function DeliveredHoursReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/hr/hours/report");
  if (!(await can(user, "hr.hours.read"))) return <ForbiddenView />;
  const [t, tc, search, yearId] = await Promise.all([
    getTranslations("hr.hours"),
    getTranslations("hr.category"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const totals = yearId
    ? totalsByCategory(
        await courseRows(user, {
          yearId,
          month: one(search.month),
          semester: one(search.semester),
          category: one(search.category),
          department: one(search.department),
          lecturer: one(search.lecturer),
          course: one(search.course),
        }),
      )
    : null;
  return (
    <>
      <PageHeader
        title={t("report.title")}
        breadcrumbs={[{ label: t("title"), href: "/hr/hours" }, { label: t("report.title") }]}
      />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("report.intro")}</p>
      {totals && (
        <dl className="mb-4 grid max-w-xl grid-cols-3 gap-3 text-sm" data-testid="category-totals">
          {(["PAE", "PAK", "VOLUNTEER"] as const).map((c) => (
            <div key={c} className="rounded-card border-border bg-card border p-3">
              <dt className="text-muted-foreground">{tc(c)}</dt>
              <dd className="font-tabular text-xl font-semibold" data-testid={`cat-${c}`}>
                {totals[c]}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <TablePage def={hoursReportTable} search={search} user={user} basePath="/hr/hours/report" />
    </>
  );
}
