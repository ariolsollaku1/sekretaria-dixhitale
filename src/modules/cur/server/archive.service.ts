import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can, grantScopes } from "@/lib/authz/guard";
import { attachFile, FileError } from "@/lib/files/files.service";
import { ARCHIVE_ENTITY, ARCHIVE_PURPOSE } from "./archive.purposes";

type Ctx = ActionContext;
const WRITE = "cur.archive.write";

const summary = (d: {
  kind: string;
  academicYearId: string;
  programId: string | null;
  title: string;
  decisionRef: string | null;
  decisionDate: Date | null;
  fileId: string;
  templateId: string | null;
  notes: string | null;
  status: string;
}) => ({
  kind: d.kind,
  academicYearId: d.academicYearId,
  programId: d.programId,
  title: d.title,
  decisionRef: d.decisionRef,
  decisionDate: d.decisionDate?.toISOString().slice(0, 10) ?? null,
  fileId: d.fileId,
  templateId: d.templateId,
  notes: d.notes,
  status: d.status,
});

/** AC-8: a program's document needs write on that program; an institution-wide one needs institution scope. */
async function assertCanWrite(ctx: Ctx, programId: string | null) {
  if (programId) {
    if (!(await can(ctx.user, WRITE, { kind: "program", id: programId })))
      throw new ForbiddenError(WRITE);
    return;
  }
  if (!(await grantScopes(ctx.user, WRITE)).institution) throw new ForbiddenError(WRITE);
}

async function adopt(ctx: Ctx, fileId: string, documentId: string) {
  const file = await ctx.db.storedFile.findUnique({
    where: { id: fileId },
    select: { purpose: true, uploadedById: true, status: true },
  });
  if (
    !file ||
    file.purpose !== ARCHIVE_PURPOSE ||
    file.uploadedById !== ctx.user.id ||
    file.status !== "PENDING"
  )
    throw new DomainError("VALIDATION", "Check the file", { fileId: ["fileInvalid"] });
  try {
    await attachFile(ctx, fileId, { entityType: ARCHIVE_ENTITY, entityId: documentId });
  } catch (error) {
    if (error instanceof FileError)
      throw new DomainError("CONFLICT", "Check the file", { fileId: ["fileInvalid"] });
    throw error;
  }
}

const toDate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

async function checkTemplate(ctx: Ctx, templateId: string | null) {
  if (!templateId) return;
  const t = await ctx.db.documentTemplate.findUnique({
    where: { id: templateId },
    select: { id: true },
  });
  if (!t) throw new DomainError("VALIDATION", "Check the template", { templateId: ["notFound"] });
}

/** AC-2 */
export async function addDocument(
  ctx: Ctx,
  input: {
    kind: "DIPLOMA_FORM" | "DIPLOMA_SUPPLEMENT" | "DECISION" | "OTHER";
    academicYearId: string;
    programId: string | null;
    fileId: string;
    title: string;
    decisionRef: string | null;
    decisionDate: string | null;
    notes: string | null;
    templateId: string | null;
  },
) {
  await assertCanWrite(ctx, input.programId);
  const year = await ctx.db.academicYear.findUnique({
    where: { id: input.academicYearId },
    select: { id: true },
  });
  if (!year)
    throw new DomainError("VALIDATION", "Check the year", { academicYearId: ["notFound"] });
  if (input.programId) {
    const program = await ctx.db.studyProgram.findUnique({
      where: { id: input.programId },
      select: { id: true },
    });
    if (!program)
      throw new DomainError("VALIDATION", "Check the program", { programId: ["notFound"] });
  }
  await checkTemplate(ctx, input.templateId);
  const created = await ctx.db.approvedDocument.create({
    data: {
      kind: input.kind,
      academicYearId: input.academicYearId,
      programId: input.programId,
      title: input.title,
      decisionRef: input.decisionRef,
      decisionDate: toDate(input.decisionDate),
      fileId: input.fileId,
      templateId: input.templateId,
      notes: input.notes,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await adopt(ctx, input.fileId, created.id);
  await ctx.audit({
    action: "cur.archive.create",
    entityType: ARCHIVE_ENTITY,
    entityId: created.id,
    before: null,
    after: summary(created),
  });
  return { documentId: created.id };
}

async function load(ctx: Ctx, id: string) {
  const doc = await ctx.db.approvedDocument.findUnique({ where: { id } });
  if (!doc) throw new DomainError("NOT_FOUND", "Document not found");
  await assertCanWrite(ctx, doc.programId);
  return doc;
}

/** AC-3 */
export async function updateDocument(
  ctx: Ctx,
  documentId: string,
  input: {
    title: string;
    decisionRef: string | null;
    decisionDate: string | null;
    notes: string | null;
    templateId: string | null;
  },
) {
  const before = await load(ctx, documentId);
  if (before.status !== "ACTIVE") throw new DomainError("CONFLICT", "DOCUMENT_WITHDRAWN");
  await checkTemplate(ctx, input.templateId);
  const after = await ctx.db.approvedDocument.update({
    where: { id: documentId },
    data: {
      title: input.title,
      decisionRef: input.decisionRef,
      decisionDate: toDate(input.decisionDate),
      notes: input.notes,
      templateId: input.templateId,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cur.archive.update",
    entityType: ARCHIVE_ENTITY,
    entityId: documentId,
    before: summary(before),
    after: summary(after),
  });
}

/** AC-4 */
export async function withdrawDocument(ctx: Ctx, documentId: string, reason: string) {
  const before = await load(ctx, documentId);
  if (before.status !== "ACTIVE") throw new DomainError("CONFLICT", "DOCUMENT_WITHDRAWN");
  const after = await ctx.db.approvedDocument.update({
    where: { id: documentId },
    data: {
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      withdrawnById: ctx.user.id,
      withdrawReason: reason,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cur.archive.withdraw",
    entityType: ARCHIVE_ENTITY,
    entityId: documentId,
    before: summary(before),
    after: { ...summary(after), reason },
  });
}
