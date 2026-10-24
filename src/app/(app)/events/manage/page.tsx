import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { eventsTable } from "@/modules/ntf";

export default async function ManageEventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/events/manage");
  if (!(await can(user, "ntf.event.write"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("evt"), searchParams]);
  return (
    <>
      <PageHeader
        title={t("manage")}
        breadcrumbs={[{ label: t("title"), href: "/events" }, { label: t("manage") }]}
        actions={
          <Link href="/events/new" className={buttonVariants()}>
            {t("new")}
          </Link>
        }
      />
      <TablePage def={eventsTable} search={search} user={user} basePath="/events/manage" />
    </>
  );
}
