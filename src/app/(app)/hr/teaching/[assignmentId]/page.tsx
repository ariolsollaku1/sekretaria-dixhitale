import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { getAssignmentRoster } from "@/modules/hr";

// HR-07 AC-6: the roster of one of the lecturer's own assignments; anything else is not found.
export default async function AssignmentRosterPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const user = await requireUser(`/hr/teaching/${assignmentId}`);
  if (!(await can(user, "hr.workspace.self"))) return <ForbiddenView />;
  const [t, tk, yearId] = await Promise.all([
    getTranslations("hr.workspace"),
    getTranslations("cur.teaching"),
    getSelectedAcademicYear(),
  ]);
  const roster = yearId ? await getAssignmentRoster(user, yearId, assignmentId) : null;
  if (!roster) notFound();
  return (
    <>
      <PageHeader
        title={t("rosterTitle")}
        breadcrumbs={[{ label: t("title"), href: "/hr/teaching" }, { label: roster.course }]}
      />
      <p className="text-muted-foreground mb-4 text-sm">
        {`${roster.course} · ${tk(`kind.${roster.kind}`)} · ${roster.group}`}
      </p>
      {roster.students.length === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("rosterEmpty")}
        </p>
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[24rem] text-sm" data-testid="roster">
            <caption className="sr-only">{t("rosterTitle")}</caption>
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="p-3 font-semibold">
                  {t("studentNumber")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("studentName")}
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.students.map((s) => (
                <tr key={s.studentId} className="border-border border-b last:border-0">
                  <td className="font-tabular p-3">{s.studentNumber}</td>
                  <th scope="row" className="p-3 text-left font-normal">
                    {s.name}
                  </th>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
