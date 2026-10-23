import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { ForbiddenView } from "@/components/forbidden-view";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { ownAssignments } from "@/modules/cur";

// AC-8: a staff member sees their own assignments for the selected year and nothing else.
export default async function MyTeachingPage() {
  const user = await requireUser("/cur/teaching/mine");
  if (!(await can(user, "cur.teaching.self"))) return <ForbiddenView />;
  const [t, yearId] = await Promise.all([
    getTranslations("cur.teaching"),
    getSelectedAcademicYear(),
  ]);
  const rows = yearId ? await ownAssignments(user, yearId) : [];
  return (
    <>
      <PageHeader title={t("mine.title")} />
      {rows === null ? (
        <EmptyState icon={UserX} title={t("mine.noStaff")} description={t("mine.noStaffHint")} />
      ) : rows.length === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("mine.empty")}
        </p>
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.course")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.semester")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.kind")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.group")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.hours")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <th scope="row" className="p-3 text-left font-normal">
                    {r.course}
                  </th>
                  <td className="font-tabular p-3">{r.semester}</td>
                  <td className="p-3">{t(`kind.${r.kind}`)}</td>
                  <td className="p-3">{r.group}</td>
                  <td className="font-tabular p-3">{r.plannedHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
