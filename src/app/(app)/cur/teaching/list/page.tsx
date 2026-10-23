import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { teachingTable } from "@/modules/cur";

export default async function TeachingListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/cur/teaching/list");
  if (!(await can(user, "cur.teaching.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("cur.teaching"), searchParams]);
  return (
    <>
      <PageHeader
        title={t("list")}
        breadcrumbs={[{ label: t("title"), href: "/cur/teaching" }, { label: t("list") }]}
      />
      <TablePage def={teachingTable} search={search} user={user} basePath="/cur/teaching/list" />
    </>
  );
}
