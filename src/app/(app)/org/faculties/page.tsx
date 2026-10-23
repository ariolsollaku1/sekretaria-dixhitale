import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { facultiesTable } from "@/modules/org";

export default async function FacultiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/org/faculties");
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("org.unit"),
    searchParams,
    can(user, "org.faculty.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("faculties")}
        actions={
          mayWrite && (
            <Link href="/org/faculties/new" className={buttonVariants()}>
              {t("createFaculty")}
            </Link>
          )
        }
      />
      <TablePage def={facultiesTable} search={search} user={user} basePath="/org/faculties" />
    </>
  );
}
