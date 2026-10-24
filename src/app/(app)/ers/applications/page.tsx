import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { erasmusApplicationsTable } from "@/modules/ers";

// ERS-01 AC-4: the Erasmus applications of the three applicant kinds.
export default async function ErasmusApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/ers/applications");
  if (!(await can(user, "ers.application.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("ers"), searchParams]);
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("intro")}</p>
      <TablePage
        def={erasmusApplicationsTable}
        search={search}
        user={user}
        basePath="/ers/applications"
      />
    </>
  );
}
