import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { plansTable } from "@/modules/cur";

export default async function PlansPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/cur/plans");
  if (!(await can(user, "cur.plan.view"))) return <ForbiddenView />;
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("cur.plan"),
    searchParams,
    can(user, "cur.plan.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <Link href="/cur/plans/new" className={buttonVariants()}>
              {t("new")}
            </Link>
          )
        }
      />
      <TablePage def={plansTable} search={search} user={user} basePath="/cur/plans" />
    </>
  );
}
