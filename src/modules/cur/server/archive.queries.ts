import "server-only";
import { can, grantScopes } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { listTemplates } from "@/lib/documents/queries";
import { planInForce } from "../domain/archive-rules";
import { archiveDocumentWhere, archiveProgramWhere } from "./archive.scope";

export type ArchiveDocumentRow = {
  id: string;
  kind: "DIPLOMA_FORM" | "DIPLOMA_SUPPLEMENT" | "DECISION" | "OTHER";
  programId: string | null;
  title: string;
  decisionRef: string | null;
  decisionDate: string | null;
  fileId: string;
  fileName: string;
  templateId: string | null;
  templateLabel: string | null;
  notes: string | null;
  status: "ACTIVE" | "WITHDRAWN";
  withdrawReason: string | null;
  createdAt: Date;
};

export type ArchiveProgram = {
  id: string;
  code: string;
  name: string;
  /** whether the viewer may file documents for this program */
  writable: boolean;
  plan: { id: string; version: number; status: string; validFrom: string } | null;
  syllabi: { approved: number; total: number };
  documents: ArchiveDocumentRow[];
};

export type Archive = {
  year: { id: string; code: string; status: string };
  programs: ArchiveProgram[];
  /** documents that apply to the whole institution */
  institution: ArchiveDocumentRow[];
  writer: boolean;
  institutionWritable: boolean;
};

/** AC-5/AC-6/AC-7: the archive of an academic year inside the viewer's scope; null when the year is unknown. */
export async function archiveOfYear(
  user: { id: string },
  academicYearId: string,
  programId?: string | null,
): Promise<Archive | null> {
  const year = await db.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, code: true, status: true, startDate: true },
  });
  if (!year) return null;
  const writer = await can(user, "cur.archive.write");
  const programScope = await archiveProgramWhere(user);
  const programs = await db.studyProgram.findMany({
    where: { AND: [programScope, programId ? { id: programId } : {}] },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, active: true },
  });
  const ids = programs.map((p) => p.id);
  const [plans, docs] = await Promise.all([
    db.curriculumPlan.findMany({
      where: { programId: { in: ids }, status: { in: ["APPROVED", "ARCHIVED"] } },
      select: {
        id: true,
        programId: true,
        version: true,
        status: true,
        validFrom: { select: { code: true, startDate: true } },
        _count: { select: { courses: true } },
      },
    }),
    db.approvedDocument.findMany({
      where: {
        AND: [{ academicYearId }, await archiveDocumentWhere(user), programId ? { programId } : {}],
      },
      orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
      include: { template: { select: { type: true, version: true, language: true } } },
    }),
  ]);
  const files = await db.storedFile.findMany({
    where: { id: { in: docs.map((d) => d.fileId) } },
    select: { id: true, fileName: true },
  });
  const names = new Map(files.map((f) => [f.id, f.fileName]));
  const rows: ArchiveDocumentRow[] = docs.map((d) => ({
    id: d.id,
    kind: d.kind,
    programId: d.programId,
    title: d.title,
    decisionRef: d.decisionRef,
    decisionDate: d.decisionDate?.toISOString().slice(0, 10) ?? null,
    fileId: d.fileId,
    fileName: names.get(d.fileId) ?? "",
    templateId: d.templateId,
    templateLabel: d.template
      ? `${d.template.type} v${d.template.version} (${d.template.language})`
      : null,
    notes: d.notes,
    status: d.status,
    withdrawReason: d.withdrawReason,
    createdAt: d.createdAt,
  }));

  const yearStart = year.startDate.toISOString().slice(0, 10);
  const inForce = new Map<string, (typeof plans)[number]>();
  for (const program of programs) {
    const mine = plans.filter((p) => p.programId === program.id);
    const best = planInForce(
      mine.map((p) => ({
        ...p,
        validFromStart: p.validFrom.startDate.toISOString().slice(0, 10),
      })),
      yearStart,
    );
    if (best) inForce.set(program.id, best);
  }
  // one approved syllabus per plan course and year (partial unique index): count the rows per plan
  const approved = await db.syllabus.findMany({
    where: {
      academicYearId,
      status: "APPROVED",
      planCourse: { planId: { in: [...inForce.values()].map((p) => p.id) } },
    },
    select: { planCourse: { select: { planId: true } } },
  });
  const approvedByPlan = new Map<string, number>();
  for (const s of approved)
    approvedByPlan.set(s.planCourse.planId, (approvedByPlan.get(s.planCourse.planId) ?? 0) + 1);

  const result: ArchiveProgram[] = [];
  for (const program of programs) {
    const plan = inForce.get(program.id) ?? null;
    const documents = rows.filter((r) => r.programId === program.id);
    if (!program.active && !plan && documents.length === 0) continue;
    result.push({
      id: program.id,
      code: program.code,
      name: program.name,
      writable:
        writer && (await can(user, "cur.archive.write", { kind: "program", id: program.id })),
      plan: plan && {
        id: plan.id,
        version: plan.version,
        status: plan.status,
        validFrom: plan.validFrom.code,
      },
      syllabi: {
        approved: plan ? (approvedByPlan.get(plan.id) ?? 0) : 0,
        total: plan?._count.courses ?? 0,
      },
      documents,
    });
  }
  return {
    year: { id: year.id, code: year.code, status: year.status },
    programs: result,
    institution: programId ? [] : rows.filter((r) => r.programId === null),
    writer,
    institutionWritable: writer && (await grantScopes(user, "cur.archive.write")).institution,
  };
}

/** Template versions a document can be linked to (AC-1). */
export async function templateOptions() {
  const templates = await listTemplates();
  return templates.map((t) => ({
    id: t.id,
    label: `${t.type} v${t.version} (${t.language}) · ${t.status}`,
  }));
}
