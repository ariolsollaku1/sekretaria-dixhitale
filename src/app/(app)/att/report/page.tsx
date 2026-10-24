import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { attReportTable, getThreshold } from "@/modules/att";

// ATT-02 AC-3, AC-5: readers see the figures of the programs in their scope, for the selected year.
export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/att/report");
  if (!(await can(user, "att.attendance.read"))) return <ForbiddenView />;
  const [t, search, threshold] = await Promise.all([
    getTranslations("att.report"),
    searchParams,
    getThreshold(),
  ]);
  return (
    <>
      <PageHeader title={t("report.title")} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
        {t("report.intro", { threshold })}
      </p>
      <TablePage def={attReportTable} search={search} user={user} basePath="/att/report" />
    </>
  );
}
