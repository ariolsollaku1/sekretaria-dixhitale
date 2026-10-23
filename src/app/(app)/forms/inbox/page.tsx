import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { formSubmissionsTable } from "@/lib/forms/table";
import type { SearchParams } from "@/lib/tables/types";

export default async function InboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/forms/inbox");
  if (!(await can(user, "plt.form.inbox"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("forms"), searchParams]);
  return (
    <>
      <PageHeader title={t("inbox.title")} />
      <TablePage def={formSubmissionsTable} search={search} user={user} basePath="/forms/inbox" />
    </>
  );
}
