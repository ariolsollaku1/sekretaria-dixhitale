import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { hoursTable } from "@/modules/hr";

// HR-04 AC-3: delivered hours per lecturer and month within the reader's scope.
export default async function DeliveredHoursPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/hr/hours");
  if (!(await can(user, "hr.hours.read"))) return <ForbiddenView />;
  const [t, search] = await Promise.all([getTranslations("hr.hours"), searchParams]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/hr/hours/report">{t("reportLink")}</Link>
          </Button>
        }
      />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("intro")}</p>
      <TablePage def={hoursTable} search={search} user={user} basePath="/hr/hours" />
    </>
  );
}
