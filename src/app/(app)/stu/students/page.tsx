import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { studentsTable } from "@/modules/stu";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/stu/students");
  if (!(await can(user, "stu.student.read"))) return <ForbiddenView />;
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("stu"),
    searchParams,
    can(user, "stu.student.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <Link href="/stu/students/new" className={buttonVariants()}>
              {t("new")}
            </Link>
          )
        }
      />
      <TablePage def={studentsTable} search={search} user={user} basePath="/stu/students" />
    </>
  );
}
