import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import type { SearchParams } from "@/lib/tables/types";
import { coursesTable, writableDepartments } from "@/modules/cur";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/cur/courses");
  const [t, search, writable] = await Promise.all([
    getTranslations("cur.course"),
    searchParams,
    writableDepartments(user),
  ]);
  const mayWrite = writable.length > 0;
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <>
              <Link href="/cur/courses/import" className={buttonVariants({ variant: "secondary" })}>
                {t("import")}
              </Link>
              <Link href="/cur/courses/new" className={buttonVariants()}>
                {t("new")}
              </Link>
            </>
          )
        }
      />
      <TablePage def={coursesTable} search={search} user={user} basePath="/cur/courses" />
    </>
  );
}
