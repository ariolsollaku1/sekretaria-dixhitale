import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { teachingLoadTable } from "@/modules/cur";

export default async function TeachingLoadPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/cur/teaching/load");
  if (!(await can(user, "cur.teaching.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("cur.load"), searchParams]);
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("intro")}</p>
      <TablePage
        def={teachingLoadTable}
        search={search}
        user={user}
        basePath="/cur/teaching/load"
      />
    </>
  );
}
