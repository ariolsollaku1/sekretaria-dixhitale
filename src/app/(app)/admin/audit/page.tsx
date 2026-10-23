import { getTranslations } from "next-intl/server";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { auditTable } from "@/lib/audit/table";
import { requireUser } from "@/lib/auth";
import type { SearchParams } from "@/lib/tables/types";

// PLT-07 AC-6: the audit list is a PLT-10 table; permission plt.audit.read is checked by the table.
export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/admin/audit");
  const [t, search] = await Promise.all([getTranslations("audit"), searchParams]);
  return (
    <>
      <PageHeader title={t("title")} />
      <TablePage def={auditTable} search={search} user={user} basePath="/admin/audit" />
    </>
  );
}
