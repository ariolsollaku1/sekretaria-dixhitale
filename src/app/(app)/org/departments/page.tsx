import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { departmentsTable } from "@/modules/org";

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/org/departments");
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("org.unit"),
    searchParams,
    can(user, "org.department.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("departmentsTitle")}
        actions={
          mayWrite && (
            <Link href="/org/departments/new" className={buttonVariants()}>
              {t("createDepartment")}
            </Link>
          )
        }
      />
      <TablePage def={departmentsTable} search={search} user={user} basePath="/org/departments" />
    </>
  );
}
