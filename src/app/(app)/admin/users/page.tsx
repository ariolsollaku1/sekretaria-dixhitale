import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { usersTable } from "@/modules/iam";

// IAM-01 AC-1: the user list is a PLT-10 table (search, role/status filters, sorting, paging,
// column chooser, saved filters, export).
export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/admin/users");
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("iam"),
    searchParams,
    can(user, "iam.user.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <Link href="/admin/users/new" className={buttonVariants()}>
              {t("new")}
            </Link>
          )
        }
      />
      <TablePage def={usersTable} search={search} user={user} basePath="/admin/users" />
    </>
  );
}
