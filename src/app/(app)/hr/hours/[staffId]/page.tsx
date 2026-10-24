import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { todayInTirane } from "@/modules/att";
import { listStaffAssignments } from "@/modules/cur";
import { HoursActions, HoursMonthView, getMonthDetail } from "@/modules/hr";

/** The month before `day` (ISO), as `YYYY-MM`. */
function previousMonth(day: string) {
  const [y, m] = day.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// HR-04 AC-5: one lecturer's month, with approve / reopen / adjust for those who may.
export default async function HoursDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { staffId } = await params;
  const user = await requireUser(`/hr/hours/${staffId}`);
  if (!(await can(user, "hr.hours.read"))) return <ForbiddenView />;
  const [t, search, yearId] = await Promise.all([
    getTranslations("hr.hours"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const raw = Array.isArray(search.month) ? search.month[0] : search.month;
  const month = raw ?? previousMonth(todayInTirane());
  const detail = yearId ? await getMonthDetail(user, staffId, month, yearId) : null;
  if (!detail || !yearId) notFound();
  const assignments = (await listStaffAssignments(staffId, yearId)).map((a) => ({
    id: a.id,
    label: `${a.courseCode} · ${a.kind} · ${a.groupName}`,
  }));
  return (
    <>
      <PageHeader
        title={detail.staff.name}
        breadcrumbs={[{ label: t("title"), href: "/hr/hours" }, { label: detail.staff.name }]}
      />
      <div className="flex flex-col gap-4">
        <HoursActions
          staffId={staffId}
          month={month}
          state={detail.state}
          canApprove={detail.can.approve}
          canAdjust={detail.can.adjust}
          assignments={assignments}
        />
        <HoursMonthView detail={detail} />
      </div>
    </>
  );
}
