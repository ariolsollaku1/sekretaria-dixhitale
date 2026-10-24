import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { clearanceTable } from "@/modules/fin";
import { MessageThesePeople } from "@/modules/ntf";
import { ListTabs } from "../tabs";

// FIN-05 SRC-049, SRC-087: who has / has not closed their obligations before an exam session;
// with result=NOT_CLEARED it is the debtors list with contact data.
export default async function ClearancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/fin/lists/clearance");
  if (!(await can(user, "fin.payment.read"))) return <ForbiddenView />;
  const [t, search, yearId] = await Promise.all([
    getTranslations("fin.lists"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const debtors = search.result === "NOT_CLEARED";
  return (
    <>
      <PageHeader
        title={debtors ? t("debtorsTitle") : t("clearanceTitle")}
        actions={<MessageThesePeople def={clearanceTable} search={search} user={user} />}
      />
      <ListTabs active={debtors ? "debtors" : "clearance"} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
        {debtors ? t("debtorsHint") : t("clearanceHint")}
      </p>
      {!yearId && (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      )}
      <TablePage def={clearanceTable} search={search} user={user} basePath="/fin/lists/clearance" />
    </>
  );
}
