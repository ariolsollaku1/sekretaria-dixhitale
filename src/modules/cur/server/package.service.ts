import "server-only";
import { PDFDocument } from "pdf-lib";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import { issueDocument } from "@/lib/documents/issue.service";
import { getStorage } from "@/lib/storage";
import {
  PACKAGE_SUBJECT,
  PACKAGE_TYPE,
  SELF_LIMIT,
  packageCounts,
  selfLimitReached,
  templateData,
} from "../domain/package-rules";
import { registerPackageType } from "./package.document";
import { collect, type CollectedCourse } from "./package.queries";

type Ctx = ActionContext;

export type PackageMode = "staff" | "self";

/** AC-7: staff by the enrollment's program; a student only for an enrollment of their own record. */
async function assertAllowed(
  ctx: Ctx,
  mode: PackageMode,
  c: { programId: string; student: { personId: string } },
) {
  if (mode === "staff") {
    if (!(await can(ctx.user, "cur.package.issue", { kind: "program", id: c.programId })))
      throw new ForbiddenError("cur.package.issue");
    return;
  }
  const u = await ctx.db.user.findUnique({
    where: { id: ctx.user.id },
    select: { personId: true },
  });
  if (
    !u?.personId ||
    u.personId !== c.student.personId ||
    !(await can(ctx.user, "cur.package.self"))
  )
    throw new ForbiddenError("cur.package.self");
}

async function readAll(key: string): Promise<Uint8Array> {
  const stream = await getStorage().get(key);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** AC-4: the chosen syllabus as a parsed PDF, or null when its file is missing or unreadable. */
async function loadSyllabus(ctx: Ctx, fileId: string): Promise<PDFDocument | null> {
  const file = await ctx.db.storedFile.findUnique({
    where: { id: fileId },
    select: { storageKey: true, status: true, deletedAt: true },
  });
  if (!file || file.status !== "ATTACHED" || file.deletedAt) return null;
  try {
    return await PDFDocument.load(await readAll(file.storageKey));
  } catch {
    return null;
  }
}

/**
 * AC-2..AC-10: issue the package of an enrollment: the rendered cover and plan table followed by
 * the approved syllabi, as one numbered, stored PDF (type `cur.study-package`).
 */
export async function issuePackage(
  ctx: Ctx,
  mode: PackageMode,
  input: { enrollmentId: string; language: "sq" | "en" },
) {
  registerPackageType();
  const c = await collect(ctx.db, input.enrollmentId);
  if (!c) throw new DomainError("NOT_FOUND", "Enrollment not found");
  await assertAllowed(ctx, mode, c);
  if (c.plan.status !== "APPROVED")
    throw new DomainError("CONFLICT", "Check the package", { enrollmentId: ["planNotApproved"] });
  if (c.courses.length === 0)
    throw new DomainError("CONFLICT", "Check the package", { enrollmentId: ["planEmpty"] });
  if (mode === "self") {
    const since = new Date(Date.now() - SELF_LIMIT.windowMs);
    const recent = await ctx.db.issuedDocument.count({
      where: { type: PACKAGE_TYPE, issuedById: ctx.user.id, issuedAt: { gt: since } },
    });
    if (selfLimitReached(recent))
      throw new DomainError("CONFLICT", "Check the package", { enrollmentId: ["limitReached"] });
  }

  // AC-4: unreadable syllabi count as missing, so the cover and the bundle agree
  const ordered: CollectedCourse[] = [...c.courses].sort(
    (a, b) =>
      a.yearOfStudy - b.yearOfStudy || a.semester - b.semester || a.code.localeCompare(b.code),
  );
  const docs: PDFDocument[] = [];
  const courses = new Map<string, CollectedCourse>();
  for (const course of ordered) {
    const pdf = course.syllabusFileId ? await loadSyllabus(ctx, course.syllabusFileId) : null;
    if (pdf) docs.push(pdf);
    courses.set(course.planCourseId, { ...course, hasSyllabus: pdf !== null });
  }
  const finalCourses = [...courses.values()];
  const counts = packageCounts(finalCourses);

  const data = templateData({
    program: c.program,
    student: { name: c.student.name, number: c.student.number },
    cohort: c.cohort,
    planVersion: c.plan.version,
    planFrom: c.plan.from,
    courses: finalCourses,
  });

  const issued = await issueDocument(ctx, {
    type: PACKAGE_TYPE,
    language: input.language,
    data,
    subject: { type: PACKAGE_SUBJECT, id: c.enrollmentId },
    finalize: async (cover) => {
      const bundle = await PDFDocument.load(cover);
      for (const doc of docs) {
        const pages = await bundle.copyPages(doc, doc.getPageIndices());
        for (const page of pages) bundle.addPage(page);
      }
      return bundle.save();
    },
  });

  // AC-10: ids and counts only, no personal data
  await ctx.audit({
    action: "cur.package.issue",
    entityType: "IssuedDocument",
    entityId: issued.documentId,
    before: null,
    after: {
      enrollmentId: c.enrollmentId,
      planId: c.plan.id,
      planVersion: c.plan.version,
      language: input.language,
      mode,
      courses: counts.courses,
      syllabi: counts.included,
      missing: counts.missing,
    },
  });
  return {
    documentId: issued.documentId,
    number: issued.number,
    fileId: issued.fileId,
    courses: counts.courses,
    syllabi: counts.included,
    missing: counts.missing,
  };
}
