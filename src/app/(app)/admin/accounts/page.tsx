import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { CohortAccounts, neverActivatedTable } from "@/modules/iam";
import { listCohortOptions } from "@/modules/stu";

// IAM-02 AC-10, AC-11: accounts that never signed in, and the cohort action.
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/admin/accounts");
  if (!(await can(user, "iam.account.read"))) return <ForbiddenView />;
  const [t, search, mayStudents] = await Promise.all([
    getTranslations("iam.accounts"),
    searchParams,
    can(user, "iam.account.student"),
  ]);
  const cohorts = mayStudents
    ? (await listCohortOptions()).map((c) => ({ id: c.id, label: `${c.program} · ${c.label}` }))
    : [];
  return (
    <>
      <PageHeader title={t("pageTitle")} />
      {mayStudents && <CohortAccounts cohorts={cohorts} />}
      <h2 className="mb-2 text-2xl font-semibold">{t("neverActivated")}</h2>
      <p className="text-muted-foreground mb-3 text-sm">{t("neverActivatedHint")}</p>
      <TablePage def={neverActivatedTable} search={search} user={user} basePath="/admin/accounts" />
    </>
  );
}
