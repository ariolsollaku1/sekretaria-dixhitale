import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { cohortsTable } from "@/modules/org";

export default async function CohortsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/org/cohorts");
  if (!(await can(user, "org.cohort.read"))) return <ForbiddenView />;
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("org.cohort"),
    searchParams,
    can(user, "org.cohort.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <Link href="/org/cohorts/new" className={buttonVariants()}>
              {t("new")}
            </Link>
          )
        }
      />
      <TablePage def={cohortsTable} search={search} user={user} basePath="/org/cohorts" />
    </>
  );
}
