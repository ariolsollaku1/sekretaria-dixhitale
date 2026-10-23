import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { staffTable } from "@/modules/hr";

export default async function StaffPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/hr/staff");
  if (!(await can(user, "hr.staff.read"))) return <ForbiddenView />;
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("hr"),
    searchParams,
    can(user, "hr.staff.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <>
              <Link href="/hr/staff/import" className={buttonVariants({ variant: "secondary" })}>
                {t("import.nav")}
              </Link>
              <Link href="/hr/staff/new" className={buttonVariants()}>
                {t("new")}
              </Link>
            </>
          )
        }
      />
      <TablePage def={staffTable} search={search} user={user} basePath="/hr/staff" />
    </>
  );
}
