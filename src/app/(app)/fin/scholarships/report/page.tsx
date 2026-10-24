import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { scholarshipReportTable } from "@/modules/fin";

// FIN-03 SRC-084: number of scholarships per academic year and study program.
export default async function ScholarshipReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/fin/scholarships/report");
  if (!(await can(user, "fin.scholarship.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("fin.scholarship"), searchParams]);
  return (
    <>
      <PageHeader
        title={t("report.title")}
        breadcrumbs={[
          { label: t("title"), href: "/fin/scholarships" },
          { label: t("report.title") },
        ]}
      />
      <p className="text-muted-foreground mb-4 text-sm">{t("report.hint")}</p>
      <TablePage
        def={scholarshipReportTable}
        search={search}
        user={user}
        basePath="/fin/scholarships/report"
      />
    </>
  );
}
