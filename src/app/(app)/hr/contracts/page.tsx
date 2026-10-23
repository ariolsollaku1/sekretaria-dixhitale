import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { contractsTable } from "@/modules/hr";

// HR-03 AC-2: ended and ending-soon contracts of employed staff.
export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/hr/contracts");
  if (!(await can(user, "hr.staff.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("hr.contracts"), searchParams]);
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("intro")}</p>
      <TablePage def={contractsTable} search={search} user={user} basePath="/hr/contracts" />
    </>
  );
}
