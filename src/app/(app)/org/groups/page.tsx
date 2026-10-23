import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { groupsTable } from "@/modules/org";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/org/groups");
  if (!(await can(user, "org.group.read"))) return <ForbiddenView />;
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("org.group"),
    searchParams,
    can(user, "org.group.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <Link
              href="/org/groups/start-of-year"
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("startOfYear.nav")}
            </Link>
          )
        }
      />
      <TablePage def={groupsTable} search={search} user={user} basePath="/org/groups" />
    </>
  );
}
