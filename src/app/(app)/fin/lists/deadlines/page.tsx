import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { deadlinesTable } from "@/modules/fin";
import { MessageThesePeople } from "@/modules/ntf";
import { ListTabs } from "../tabs";

// FIN-05 SRC-085, SRC-087: installments by payment deadline, shared by Finance and the Secretariat.
export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/fin/lists/deadlines");
  if (!(await can(user, "fin.payment.read"))) return <ForbiddenView />;
  const [t, search, yearId] = await Promise.all([
    getTranslations("fin.lists"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  return (
    <>
      <PageHeader
        title={t("deadlinesTitle")}
        actions={<MessageThesePeople def={deadlinesTable} search={search} user={user} />}
      />
      <ListTabs active="deadlines" />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("deadlinesHint")}</p>
      {!yearId && (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      )}
      <TablePage def={deadlinesTable} search={search} user={user} basePath="/fin/lists/deadlines" />
    </>
  );
}
