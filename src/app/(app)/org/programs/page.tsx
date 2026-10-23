import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { programsTable } from "@/modules/org";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/org/programs");
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("org.program"),
    searchParams,
    can(user, "org.program.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <Link href="/org/programs/new" className={buttonVariants()}>
              {t("create")}
            </Link>
          )
        }
      />
      <TablePage def={programsTable} search={search} user={user} basePath="/org/programs" />
    </>
  );
}
