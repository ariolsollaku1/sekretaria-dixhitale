import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { eventAttendeesTable } from "@/modules/ntf";

// AC-11: who is registered; only organisers, never ordinary readers.
export default async function EventAttendeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/events/attendees");
  if (!(await can(user, "ntf.event.write"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("evt"), searchParams]);
  return (
    <>
      <PageHeader
        title={t("attendees")}
        breadcrumbs={[{ label: t("title"), href: "/events" }, { label: t("attendees") }]}
      />
      <TablePage
        def={eventAttendeesTable}
        search={search}
        user={user}
        basePath="/events/attendees"
      />
    </>
  );
}
