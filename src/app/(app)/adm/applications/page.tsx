import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { applicationsTable } from "@/modules/adm";

// ADM-02 AC-11: every application with its status and missing documents.
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/adm/applications");
  if (!(await can(user, "adm.application.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("adm.applications"), searchParams]);
  return (
    <>
      <PageHeader title={t("title")} />
      <TablePage def={applicationsTable} search={search} user={user} basePath="/adm/applications" />
    </>
  );
}
