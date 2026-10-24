import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { HoursMonthView, MonthList, getOwnHours } from "@/modules/hr";

// HR-04 AC-2: the signed-in lecturer's own delivered hours; everything is keyed on the user.
export default async function MyHoursPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/hr/hours/mine");
  if (!(await can(user, "hr.hours.self"))) return <ForbiddenView />;
  const [t, search, yearId] = await Promise.all([
    getTranslations("hr.hours"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const month = Array.isArray(search.month) ? search.month[0] : search.month;
  const own = yearId ? await getOwnHours(user.id, yearId, month) : null;
  return (
    <>
      <PageHeader title={t("mine.title")} />
      {own ? (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground max-w-2xl text-sm">{t("mine.intro")}</p>
          <MonthList months={own.months} selected={own.selected?.month} base="/hr/hours/mine" />
          {own.selected && <HoursMonthView detail={own.selected} />}
        </div>
      ) : (
        <EmptyState icon={UserX} title={t("mine.noStaff")} description={t("mine.noStaffHint")} />
      )}
    </>
  );
}
