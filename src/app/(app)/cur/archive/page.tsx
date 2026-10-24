import { Archive } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  ArchiveDocumentDialog,
  ArchiveDocumentTable,
  archiveOfYear,
  archiveTemplateOptions,
} from "@/modules/cur";
import { getYear } from "@/modules/org";

// AC-5: what is approved for the selected academic year, per program, and the filed documents.
export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const user = await requireUser("/cur/archive");
  if (!(await can(user, "cur.archive.view"))) return <ForbiddenView />;
  const [t, params, yearId] = await Promise.all([
    getTranslations("cur.archive"),
    searchParams,
    getSelectedAcademicYear(),
  ]);
  const header = <PageHeader title={t("title")} />;
  const year = yearId ? await getYear(yearId) : null;
  if (!year)
    return (
      <>
        {header}
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      </>
    );
  const data = await archiveOfYear(user, year.id, params.program || null);
  if (!data) return <ForbiddenView />;
  const allPrograms = params.program ? await archiveOfYear(user, year.id, null) : data;
  const templates = data.writer ? await archiveTemplateOptions() : [];
  const view = (d: (typeof data.institution)[number]) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    decisionRef: d.decisionRef,
    decisionDate: d.decisionDate,
    fileId: d.fileId,
    fileName: d.fileName,
    templateId: d.templateId,
    templateLabel: d.templateLabel,
    notes: d.notes,
    status: d.status,
    withdrawReason: d.withdrawReason,
  });
  return (
    <>
      {header}
      <p className="text-muted-foreground mb-4 text-sm">{t("forYear", { year: year.code })}</p>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-program">{t("fields.program")}</Label>
          <Select id="f-program" name="program" defaultValue={params.program ?? ""}>
            <option value="">{t("allPrograms")}</option>
            {(allPrograms?.programs ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          {t("show")}
        </Button>
      </form>
      {data.programs.length === 0 && data.institution.length === 0 && !data.institutionWritable && (
        <EmptyState icon={Archive} title={t("empty")} description={t("emptyHint")} />
      )}
      {data.programs.map((p) => (
        <section key={p.id} className="mb-10" aria-labelledby={`p-${p.id}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id={`p-${p.id}`} className="text-lg font-semibold">
              {p.code} — {p.name}
            </h2>
            {p.writable && (
              <ArchiveDocumentDialog yearId={year.id} templates={templates} programId={p.id} />
            )}
          </div>
          <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t("planInForce")}</dt>
              <dd>
                {p.plan ? (
                  <Link href={`/cur/plans/${p.plan.id}`} className="underline">
                    {t("planLabel", { version: p.plan.version, from: p.plan.validFrom })}
                  </Link>
                ) : (
                  t("noPlan")
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("syllabi")}</dt>
              <dd>
                {p.plan ? (
                  <Link href={`/cur/syllabi?plan=${p.plan.id}`} className="underline">
                    {t("syllabiCount", { approved: p.syllabi.approved, total: p.syllabi.total })}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          <ArchiveDocumentTable
            docs={p.documents.map(view)}
            yearId={year.id}
            writable={p.writable}
            templates={templates}
            fixedProgramId={p.id}
          />
        </section>
      ))}
      {!params.program && (data.institution.length > 0 || data.institutionWritable) && (
        <section className="mb-10" aria-labelledby="p-institution">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="p-institution" className="text-lg font-semibold">
              {t("institution")}
            </h2>
            {data.institutionWritable && (
              <ArchiveDocumentDialog yearId={year.id} templates={templates} programId={null} />
            )}
          </div>
          <ArchiveDocumentTable
            docs={data.institution.map(view)}
            yearId={year.id}
            writable={data.institutionWritable}
            templates={templates}
            fixedProgramId={null}
          />
        </section>
      )}
    </>
  );
}
