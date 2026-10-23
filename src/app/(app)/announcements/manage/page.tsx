import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { announcementsTable } from "@/modules/ntf";

export default async function ManageAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/announcements/manage");
  if (!(await can(user, "ntf.announcement.write"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("ntf"), searchParams]);
  return (
    <>
      <PageHeader
        title={t("manage")}
        breadcrumbs={[{ label: t("title"), href: "/announcements" }, { label: t("manage") }]}
        actions={
          <Link href="/announcements/new" className={buttonVariants()}>
            {t("new")}
          </Link>
        }
      />
      <TablePage
        def={announcementsTable}
        search={search}
        user={user}
        basePath="/announcements/manage"
      />
    </>
  );
}
