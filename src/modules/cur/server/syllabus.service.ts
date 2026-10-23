import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import { attachFile, FileError, removeFile } from "@/lib/files/files.service";
import { getStorage } from "@/lib/storage";
import { StorageError, newStorageKey } from "@/lib/storage/storage";
import { nextSyllabusVersion, planCarryForward } from "../domain/syllabus-rules";
import { SYLLABUS_ENTITY, SYLLABUS_PURPOSE } from "./syllabus.purposes";

type Ctx = ActionContext;
const WRITE = "cur.syllabus.write";

const summary = (s: {
  planCourseId: string;
  academicYearId: string;
  version: number;
  status: string;
  fileId: string;
  notes: string | null;
}) => ({
  planCourseId: s.planCourseId,
  academicYearId: s.academicYearId,
  version: s.version,
  status: s.status,
  fileId: s.fileId,
  notes: s.notes,
});

async function assertCanWrite(ctx: Ctx, programId: string) {
  if (!(await can(ctx.user, WRITE, { kind: "program", id: programId })))
    throw new ForbiddenError(WRITE);
}

/** AC-2: the plan must be approved and the year open. */
async function loadCell(ctx: Ctx, planCourseId: string, academicYearId: string) {
  const pc = await ctx.db.planCourse.findUnique({
    where: { id: planCourseId },
    select: { id: true, planId: true, plan: { select: { programId: true, status: true } } },
  });
  if (!pc) throw new DomainError("NOT_FOUND", "Course not found");
  await assertCanWrite(ctx, pc.plan.programId);
  if (pc.plan.status !== "APPROVED")
    throw new DomainError("CONFLICT", "Check the syllabus", { planCourseId: ["planNotApproved"] });
  const year = await ctx.db.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, status: true },
  });
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  if (year.status === "CLOSED")
    throw new DomainError("CONFLICT", "Check the syllabus", { academicYearId: ["yearClosed"] });
  return pc;
}

async function loadSyllabus(ctx: Ctx, id: string) {
  const s = await ctx.db.syllabus.findUnique({
    where: { id },
    include: {
      planCourse: { select: { plan: { select: { programId: true, status: true } } } },
      academicYear: { select: { status: true } },
    },
  });
  if (!s) throw new DomainError("NOT_FOUND", "Syllabus not found");
  await assertCanWrite(ctx, s.planCourse.plan.programId);
  return s;
}

async function adopt(ctx: Ctx, fileId: string, syllabusId: string) {
  const file = await ctx.db.storedFile.findUnique({
    where: { id: fileId },
    select: { purpose: true, uploadedById: true, status: true },
  });
  // only the uploader's own pending file of this purpose
  if (
    !file ||
    file.purpose !== SYLLABUS_PURPOSE ||
    file.uploadedById !== ctx.user.id ||
    file.status !== "PENDING"
  )
    throw new DomainError("VALIDATION", "Check the file", { fileId: ["fileInvalid"] });
  try {
    await attachFile(ctx, fileId, { entityType: SYLLABUS_ENTITY, entityId: syllabusId });
  } catch (error) {
    if (error instanceof FileError)
      throw new DomainError("CONFLICT", "Check the file", { fileId: ["fileInvalid"] });
    throw error;
  }
}

const cleanNotes = (n: string | null | undefined) => n?.trim() || null;

/** AC-2 */
export async function uploadSyllabus(
  ctx: Ctx,
  input: { planCourseId: string; academicYearId: string; fileId: string; notes?: string | null },
) {
  await loadCell(ctx, input.planCourseId, input.academicYearId);
  const existing = await ctx.db.syllabus.findMany({
    where: { planCourseId: input.planCourseId, academicYearId: input.academicYearId },
    select: { version: true },
  });
  const created = await ctx.db.syllabus.create({
    data: {
      planCourseId: input.planCourseId,
      academicYearId: input.academicYearId,
      version: nextSyllabusVersion(existing.map((e) => e.version)),
      fileId: input.fileId,
      notes: cleanNotes(input.notes),
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await adopt(ctx, input.fileId, created.id);
  await ctx.audit({
    action: "cur.syllabus.create",
    entityType: "Syllabus",
    entityId: created.id,
    before: null,
    after: summary(created),
  });
  return { syllabusId: created.id, version: created.version };
}

/** AC-3: replace the file and / or the notes of a draft. */
export async function updateDraft(
  ctx: Ctx,
  syllabusId: string,
  input: { fileId?: string; notes?: string | null },
) {
  const before = await loadSyllabus(ctx, syllabusId);
  if (before.status !== "DRAFT") throw new DomainError("CONFLICT", "SYLLABUS_FROZEN");
  const replacing = input.fileId && input.fileId !== before.fileId;
  if (replacing) await adopt(ctx, input.fileId!, syllabusId);
  const after = await ctx.db.syllabus.update({
    where: { id: syllabusId },
    data: {
      ...(replacing ? { fileId: input.fileId } : {}),
      notes: input.notes === undefined ? before.notes : cleanNotes(input.notes),
      updatedById: ctx.user.id,
    },
  });
  if (replacing) await removeFile(ctx, before.fileId, "Replaced by a newer file");
  await ctx.audit({
    action: "cur.syllabus.update",
    entityType: "Syllabus",
    entityId: syllabusId,
    before: summary(before),
    after: summary(after),
  });
}

/** AC-3: drafts are technical rows and may be deleted; their file is soft-removed. */
export async function deleteDraft(ctx: Ctx, syllabusId: string) {
  const before = await loadSyllabus(ctx, syllabusId);
  if (before.status !== "DRAFT") throw new DomainError("CONFLICT", "SYLLABUS_FROZEN");
  await ctx.db.syllabus.delete({ where: { id: syllabusId } });
  await removeFile(ctx, before.fileId, "Draft syllabus deleted");
  await ctx.audit({
    action: "cur.syllabus.delete",
    entityType: "Syllabus",
    entityId: syllabusId,
    before: summary(before),
    after: null,
  });
}

/** AC-4: the draft becomes the approved one; the previous approved version is archived. */
export async function approve(ctx: Ctx, syllabusId: string) {
  const before = await loadSyllabus(ctx, syllabusId);
  if (before.status !== "DRAFT") throw new DomainError("CONFLICT", "Only a draft can be approved");
  if (before.planCourse.plan.status !== "APPROVED")
    throw new DomainError("CONFLICT", "Check the syllabus", { planCourseId: ["planNotApproved"] });
  if (before.academicYear.status === "CLOSED")
    throw new DomainError("CONFLICT", "Check the syllabus", { academicYearId: ["yearClosed"] });
  const previous = await ctx.db.syllabus.findFirst({
    where: {
      planCourseId: before.planCourseId,
      academicYearId: before.academicYearId,
      status: "APPROVED",
    },
  });
  if (previous) {
    const archived = await ctx.db.syllabus.update({
      where: { id: previous.id },
      data: { status: "ARCHIVED", updatedById: ctx.user.id },
    });
    await ctx.audit({
      action: "cur.syllabus.archive",
      entityType: "Syllabus",
      entityId: previous.id,
      before: summary(previous),
      after: summary(archived),
    });
  }
  const after = await ctx.db.syllabus.update({
    where: { id: syllabusId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cur.syllabus.approve",
    entityType: "Syllabus",
    entityId: syllabusId,
    before: summary(before),
    after: summary(after),
  });
}

export type CarryResult = {
  created: number;
  existing: number;
  noSource: number;
  sourceMissing: number;
};

/** AC-7: draft copies of the latest earlier approved syllabus for courses that have none in the year. */
export async function carryForward(
  ctx: Ctx,
  input: { planId: string; academicYearId: string },
): Promise<CarryResult> {
  const plan = await ctx.db.curriculumPlan.findUnique({
    where: { id: input.planId },
    select: {
      status: true,
      programId: true,
      courses: { select: { id: true, courseId: true } },
    },
  });
  if (!plan) throw new DomainError("NOT_FOUND", "Plan not found");
  await assertCanWrite(ctx, plan.programId);
  if (plan.status !== "APPROVED")
    throw new DomainError("CONFLICT", "Check the syllabus", { planId: ["planNotApproved"] });
  const year = await ctx.db.academicYear.findUnique({
    where: { id: input.academicYearId },
    select: { startDate: true, status: true },
  });
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  if (year.status === "CLOSED")
    throw new DomainError("CONFLICT", "Check the syllabus", { academicYearId: ["yearClosed"] });

  const live = await ctx.db.syllabus.findMany({
    where: {
      academicYearId: input.academicYearId,
      status: { in: ["DRAFT", "APPROVED"] },
      planCourseId: { in: plan.courses.map((c) => c.id) },
    },
    select: { planCourseId: true },
  });
  const liveSet = new Set(live.map((l) => l.planCourseId));
  // candidates: approved syllabi of the same courses in any plan of the program, earlier years
  const candidates = await ctx.db.syllabus.findMany({
    where: {
      status: { in: ["APPROVED", "ARCHIVED"] },
      approvedAt: { not: null },
      planCourse: {
        courseId: { in: plan.courses.map((c) => c.courseId) },
        plan: { programId: plan.programId },
      },
      academicYear: { startDate: { lt: year.startDate } },
    },
    select: {
      id: true,
      status: true,
      version: true,
      planCourse: { select: { courseId: true } },
      academicYear: { select: { startDate: true } },
    },
  });
  // per course and year only the approved version counts (an archived one was replaced in that year)
  const sources = new Map<string, { syllabusId: string; academicYearStart: string }[]>();
  for (const c of candidates) {
    if (c.status !== "APPROVED") continue;
    const list = sources.get(c.planCourse.courseId) ?? [];
    list.push({
      syllabusId: c.id,
      academicYearStart: c.academicYear.startDate.toISOString().slice(0, 10),
    });
    sources.set(c.planCourse.courseId, list);
  }
  const planned = planCarryForward(
    plan.courses.map((c) => ({
      planCourseId: c.id,
      courseId: c.courseId,
      live: liveSet.has(c.id),
    })),
    sources,
    year.startDate.toISOString().slice(0, 10),
  );
  const result: CarryResult = {
    created: 0,
    existing: planned.skipped.filter((s) => s.reason === "existing").length,
    noSource: planned.skipped.filter((s) => s.reason === "noSource").length,
    sourceMissing: 0,
  };
  const storage = getStorage();
  for (const item of planned.create) {
    const source = await ctx.db.syllabus.findUniqueOrThrow({
      where: { id: item.sourceSyllabusId },
    });
    const file = await ctx.db.storedFile.findFirst({
      where: { id: source.fileId, deletedAt: null },
    });
    let bytes: Uint8Array;
    try {
      if (!file) throw new StorageError("NOT_FOUND", "no file");
      bytes = await storage.read(file.storageKey);
    } catch (error) {
      if (error instanceof StorageError && error.code === "NOT_FOUND") {
        result.sourceMissing += 1;
        continue;
      }
      throw error;
    }
    const existing = await ctx.db.syllabus.findMany({
      where: { planCourseId: item.planCourseId, academicYearId: input.academicYearId },
      select: { version: true },
    });
    const newFileId = randomBytes(12).toString("hex");
    const storageKey = newStorageKey(newFileId);
    await storage.put(storageKey, bytes);
    ctx.onFailure(() => storage.delete(storageKey));
    const created = await ctx.db.syllabus.create({
      data: {
        planCourseId: item.planCourseId,
        academicYearId: input.academicYearId,
        version: nextSyllabusVersion(existing.map((e) => e.version)),
        fileId: newFileId,
        notes: source.notes,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      },
    });
    await ctx.db.storedFile.create({
      data: {
        id: newFileId,
        storageKey,
        purpose: SYLLABUS_PURPOSE,
        fileName: file!.fileName,
        mimeType: file!.mimeType,
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        status: "ATTACHED",
        entityType: SYLLABUS_ENTITY,
        entityId: created.id,
        attachedAt: new Date(),
        uploadedById: ctx.user.id,
      },
    });
    await ctx.audit({
      action: "cur.syllabus.create",
      entityType: "Syllabus",
      entityId: created.id,
      before: null,
      after: { ...summary(created), copiedFrom: source.id },
    });
    result.created += 1;
  }
  return result;
}
