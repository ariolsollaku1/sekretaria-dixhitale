import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { attSummaryTable, getThreshold } from "@/modules/att";

// ATT-02 AC-4, AC-5: per group and course summary within the reader's scope.
export default async function AttendanceSummaryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/att/summary");
  if (!(await can(user, "att.attendance.read"))) return <ForbiddenView />;
  const [t, search, threshold] = await Promise.all([
    getTranslations("att.report"),
    searchParams,
    getThreshold(),
  ]);
  return (
    <>
      <PageHeader title={t("summary.title")} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
        {t("summary.intro", { threshold })}
      </p>
      <TablePage def={attSummaryTable} search={search} user={user} basePath="/att/summary" />
    </>
  );
}
