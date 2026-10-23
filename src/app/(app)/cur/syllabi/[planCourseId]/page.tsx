import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { syllabusHistory } from "@/modules/cur";

const TONE: Record<string, StatusTone> = {
  APPROVED: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
};

// AC-6: every version of a course in an academic year (staff only).
export default async function SyllabusHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ planCourseId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { planCourseId } = await params;
  const user = await requireUser(`/cur/syllabi/${planCourseId}`);
  if (!(await can(user, "cur.syllabus.read"))) return <ForbiddenView />;
  const [t, locale, q, selected] = await Promise.all([
    getTranslations("cur.syllabi"),
    getLocale(),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const yearId = q.year ?? selected;
  if (!yearId) notFound();
  const data = await syllabusHistory(user, planCourseId, yearId);
  if (!data) notFound();
  const title = `${data.course.code} — ${data.course.name}`;
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("title"), href: "/cur/syllabi" }, { label: title }]}
      />
      <p className="text-muted-foreground mb-4 text-sm">
        {data.programCode} · v{data.planVersion}
      </p>
      <div className="rounded-card border-border bg-card overflow-x-auto border">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              {["version", "state", "file", "notes", "created", "approved"].map((c) => (
                <th key={c} scope="col" className="p-3 font-semibold">
                  {t(`historyColumns.${c}` as never)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id} className="border-border border-b align-top last:border-0">
                <th scope="row" className="font-tabular p-3 text-left font-semibold">
                  {e.version}
                </th>
                <td className="p-3">
                  <StatusBadge tone={TONE[e.status]!} label={t(`status.${e.status}`)} />
                </td>
                <td className="p-3">
                  <a
                    href={`/api/files/${e.fileId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {e.fileName}
                  </a>
                </td>
                <td className="p-3">{e.notes ?? "—"}</td>
                <td className="p-3">
                  {e.createdBy ?? "—"}
                  <br />
                  <span className="text-muted-foreground font-tabular text-[13px]">
                    {formatDateTime(e.createdAt, locale as Locale)}
                  </span>
                </td>
                <td className="p-3">
                  {e.approvedAt ? (
                    <>
                      {e.approvedBy ?? "—"}
                      <br />
                      <span className="text-muted-foreground font-tabular text-[13px]">
                        {formatDateTime(e.approvedAt, locale as Locale)}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-10">
        {data.entries.map((e) => (
          <EntityHistory
            key={e.id}
            entityType="Syllabus"
            entityId={e.id}
            permission="cur.syllabus.read"
          />
        ))}
      </div>
    </>
  );
}
