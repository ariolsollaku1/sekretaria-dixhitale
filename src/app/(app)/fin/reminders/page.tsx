import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { getReminderSettings, remindersTable } from "@/modules/fin";

// FIN-04 AC-6 (SRC-086): the log of payment reminders, read by Finance and the Secretariat.
export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/fin/reminders");
  if (!(await can(user, "fin.payment.read"))) return <ForbiddenView />;
  const [t, search, settings] = await Promise.all([
    getTranslations("fin.reminders"),
    searchParams,
    getReminderSettings(),
  ]);
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
        {t("intro", { days: settings.daysBefore })}{" "}
        {settings.overdueAfter === null
          ? t("overdueOff")
          : t("overdueOn", { days: settings.overdueAfter })}
      </p>
      <TablePage def={remindersTable} search={search} user={user} basePath="/fin/reminders" />
    </>
  );
}
