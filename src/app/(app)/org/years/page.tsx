import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { yearsTable } from "@/modules/org";

export default async function YearsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/org/years");
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("org"),
    searchParams,
    can(user, "org.year.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Link href="/org/years/rollover" className={buttonVariants({ variant: "secondary" })}>
              {t("rollover.nav")}
            </Link>
            {mayWrite && (
              <Link href="/org/years/new" className={buttonVariants()}>
                {t("new")}
              </Link>
            )}
          </>
        }
      />
      <TablePage def={yearsTable} search={search} user={user} basePath="/org/years" />
    </>
  );
}
