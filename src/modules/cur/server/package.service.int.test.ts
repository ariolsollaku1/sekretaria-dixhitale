import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { setConverter } from "@/lib/documents/gotenberg";
import { PdfUnavailableError } from "@/lib/documents/gotenberg";
import { mayReadDocument } from "@/lib/documents/queries";
import { LocalStorage, setStorage } from "@/lib/storage";
import { newStorageKey } from "@/lib/storage/storage";
import "@/modules/org";
import "@/modules/cur";
import { DEFAULT_PACKAGE_TEMPLATES } from "../domain/package-template";
import { PACKAGE_TYPE } from "../domain/package-rules";
import { registerPackageType } from "./package.document";
import { ownPackages, recentIssued, searchStudents } from "./package.queries";
import * as svc from "./package.service";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** A PDF of `pages` blank pages. */
async function pdfBytes(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}
const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

let actorId = "sec";
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: actorId,
      email: `${actorId}@t.test`,
      name: actorId,
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "cur.package.issue",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const issue = (mode: svc.PackageMode, enrollmentId: string, language: "sq" | "en" = "sq") =>
  run((ctx) => svc.issuePackage(ctx, mode, { enrollmentId, language }));

let dir: string;
let storage: LocalStorage;
let prog1: string, prog2: string, dep1: string, dep2: string;
let y24: string, y25: string;
let plan: string, pcA: string, pcB: string, pcC: string;
let cohort: string;
let enrollmentA: string, enrollmentOther: string, enrollmentP2: string;
let fileCounter = 0;

async function storedPdf(pages: number, content?: Uint8Array) {
  const id = `f${String(++fileCounter).padStart(10, "0")}abcdef`;
  const key = newStorageKey(id);
  const bytes = content ?? (await pdfBytes(pages));
  await storage.put(key, bytes);
  await db.storedFile.create({
    data: {
      id,
      storageKey: key,
      purpose: "syllabus",
      fileName: "syllabus.pdf",
      mimeType: "application/pdf",
      size: bytes.length,
      sha256: "x".repeat(64),
      status: "ATTACHED",
      uploadedById: "sec",
    },
  });
  return id;
}

async function syllabus(
  planCourseId: string,
  academicYearId: string,
  fileId: string,
  status: "DRAFT" | "APPROVED" | "ARCHIVED" = "APPROVED",
  version = 1,
) {
  return db.syllabus.create({
    data: { planCourseId, academicYearId, version, status, fileId },
  });
}

async function user(id: string, role: string, scope?: { type: "PROGRAM" | "SELF"; id?: string }) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: {
      userId: id,
      role: role as never,
      scopeType: scope?.type ?? "INSTITUTION",
      scopeId: scope?.id ?? null,
    },
  });
}

async function mkStudent(userId: string, number: string, first: string) {
  const person = await db.person.create({
    data: { firstName: first, lastName: "Test", gender: "FEMALE", birthDate: d("2003-01-01") },
  });
  await db.user.create({
    data: { id: userId, email: `${userId}@t.test`, name: first, personId: person.id },
  });
  await db.userRole.create({ data: { userId, role: "student", scopeType: "SELF" } });
  return db.student.create({ data: { personId: person.id, studentNumber: number } });
}
const enroll = (studentId: string, programId: string, cohortId: string) =>
  db.enrollment
    .create({
      data: {
        studentId,
        programId,
        cohortId,
        registrationType: "FIRST_TIME",
        startedAt: d("2024-09-15"),
      },
    })
    .then((e) => e.id);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "pkg-"));
  storage = new LocalStorage(dir);
  setStorage(storage);
  registerPackageType();
  // a one-page "cover" instead of Gotenberg
  setConverter(async () => pdfBytes(1));
});
afterAll(async () => {
  setStorage(undefined);
  setConverter(undefined);
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  for (const t of ["syllabi", "document_templates", "issued_documents"])
    await db.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "issued_documents", "document_counters", "document_templates", "syllabi", "stored_files", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "user_roles", "study_programs", "departments", "faculties", "academic_years", "system_settings" CASCADE',
  );
  for (const t of ["syllabi", "document_templates", "issued_documents"])
    await db.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  dep1 = (await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } })).id;
  dep2 = (await db.department.create({ data: { code: "D2", name: "D2", facultyId: f.id } })).id;
  const mkProg = (code: string, departmentId: string) =>
    db.studyProgram
      .create({
        data: {
          departmentId,
          cycle: "FIRST",
          code,
          name: `Prog ${code}`,
          durationYears: 3,
          totalCredits: 180,
        },
      })
      .then((p) => p.id);
  prog1 = await mkProg("P1", dep1);
  prog2 = await mkProg("P2", dep2);
  const mkYear = (code: string, start: string, status: "CLOSED" | "CURRENT") =>
    db.academicYear
      .create({
        data: {
          code,
          startDate: d(start),
          endDate: d(`${Number(start.slice(0, 4)) + 1}-08-31`),
          status,
        },
      })
      .then((y) => y.id);
  y24 = await mkYear("2024-2025", "2024-09-01", "CLOSED");
  y25 = await mkYear("2025-2026", "2025-09-01", "CURRENT");
  const mkCourse = (code: string) =>
    db.course
      .create({ data: { code, name: `Course ${code}`, defaultCredits: 6, departmentId: dep1 } })
      .then((c) => c.id);
  const [cA, cB, cC] = [await mkCourse("CA"), await mkCourse("CB"), await mkCourse("CC")];
  plan = (
    await db.curriculumPlan.create({
      data: { programId: prog1, version: 1, validFromAcademicYearId: y24, status: "DRAFT" },
    })
  ).id;
  const mkPc = (courseId: string, yearOfStudy: number, semester: number, credits: number) =>
    db.planCourse
      .create({ data: { planId: plan, courseId, yearOfStudy, semester, credits } })
      .then((p) => p.id);
  pcA = await mkPc(cA, 1, 1, 6);
  pcB = await mkPc(cB, 1, 2, 4);
  pcC = await mkPc(cC, 2, 1, 5);
  await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
  cohort = (
    await db.cohort.create({
      data: { programId: prog1, startAcademicYearId: y24, curriculumPlanId: plan, name: "C24" },
    })
  ).id;
  const group = (
    await db.studentGroup.create({
      data: { cohortId: cohort, academicYearId: y24, yearOfStudy: 1, name: "G1" },
    })
  ).id;

  await user("sec", "secretary");
  await user("coord2", "program_coordinator", { type: "PROGRAM", id: prog2 });
  await user("coord1", "program_coordinator", { type: "PROGRAM", id: prog1 });
  await user("lect", "lecturer");
  const sa = await mkStudent("stuA", "900001", "Ana");
  const sb = await mkStudent("stuB", "900002", "Besa");
  enrollmentA = await enroll(sa.id, prog1, cohort);
  enrollmentOther = await enroll(sb.id, prog1, cohort);
  // Ana studied year 1 in 2024-2025
  await db.yearRegistration.create({
    data: { enrollmentId: enrollmentA, academicYearId: y24, yearOfStudy: 1, groupId: group },
  });
  // a second program with its own plan (empty), cohort and a student
  const plan2 = await db.curriculumPlan.create({
    data: { programId: prog2, version: 1, validFromAcademicYearId: y24, status: "APPROVED" },
  });
  const cohort2 = await db.cohort.create({
    data: { programId: prog2, startAcademicYearId: y24, curriculumPlanId: plan2.id, name: "C2" },
  });
  const sc = await mkStudent("stuC", "900003", "Cela");
  enrollmentP2 = await enroll(sc.id, prog2, cohort2.id);

  for (const language of ["sq", "en"] as const)
    await db.documentTemplate.create({
      data: {
        type: PACKAGE_TYPE,
        version: 1,
        language,
        validFrom: d("2000-01-01"),
        status: "PUBLISHED",
        html: DEFAULT_PACKAGE_TEMPLATES[language],
        publishedAt: new Date(),
      },
    });
  actorId = "sec";
});

describe("issuePackage (AC-1..AC-4, AC-10)", () => {
  it("merges the cover and the chosen approved syllabi, hashes the final file and audits", async () => {
    // CA: two approved years -> the one of the year Ana studied (2024-2025, 2 pages) wins
    const fa24 = await storedPdf(2);
    const fa25 = await storedPdf(3);
    await syllabus(pcA, y24, fa24);
    await syllabus(pcA, y25, fa25);
    // CB: a draft only -> missing; CC: archived only -> missing
    await syllabus(pcB, y24, await storedPdf(1), "DRAFT");
    await syllabus(pcC, y24, await storedPdf(1), "ARCHIVED");

    const r = ok(await issue("staff", enrollmentA));
    expect(r).toMatchObject({ courses: 3, syllabi: 1, missing: 2 });
    expect(r.number).toMatch(/^PLN-\d{4}-00001$/);

    const doc = await db.issuedDocument.findUniqueOrThrow({ where: { id: r.documentId } });
    expect(doc).toMatchObject({
      type: PACKAGE_TYPE,
      subjectType: "Enrollment",
      subjectId: enrollmentA,
      issuedById: "sec",
    });
    const stored = await db.storedFile.findUniqueOrThrow({ where: { id: doc.fileId } });
    const bytes = new Uint8Array(
      await new Response(await storage.get(stored.storageKey)).arrayBuffer(),
    );
    expect(await pageCount(bytes)).toBe(1 + 2);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(doc.sha256);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "cur.package.issue" } });
    expect(audit.after).toMatchObject({
      enrollmentId: enrollmentA,
      courses: 3,
      syllabi: 1,
      missing: 2,
      mode: "staff",
    });
    expect(JSON.stringify(audit.after)).not.toContain("Ana");
  });

  it("falls back to the most recent approved year when the student's year has none", async () => {
    await syllabus(pcA, y25, await storedPdf(3));
    const r = ok(await issue("staff", enrollmentA));
    const doc = await db.issuedDocument.findUniqueOrThrow({ where: { id: r.documentId } });
    const stored = await db.storedFile.findUniqueOrThrow({ where: { id: doc.fileId } });
    const bytes = new Uint8Array(
      await new Response(await storage.get(stored.storageKey)).arrayBuffer(),
    );
    expect(await pageCount(bytes)).toBe(1 + 3);
  });

  it("counts a missing or unreadable syllabus file as missing and still issues", async () => {
    await syllabus(pcA, y24, await storedPdf(0, new TextEncoder().encode("not a pdf")));
    const gone = await storedPdf(1);
    await syllabus(pcB, y24, gone);
    await db.storedFile.update({ where: { id: gone }, data: { deletedAt: new Date() } });
    const r = ok(await issue("staff", enrollmentA, "en"));
    expect(r).toMatchObject({ courses: 3, syllabi: 0, missing: 3 });
  });

  it("refuses a draft plan, an empty plan and an unknown enrollment without using a number", async () => {
    await db.curriculumPlan.update({ where: { id: plan }, data: { status: "ARCHIVED" } });
    expect(await issue("staff", enrollmentA)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    // enrollmentP2's plan has no courses
    actorId = "sec";
    expect(await issue("staff", enrollmentP2)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await issue("staff", "nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.documentCounter.count()).toBe(0);
    expect(await db.issuedDocument.count()).toBe(0);
  });

  it("issues nothing when there is no template or the converter is down (AC-6)", async () => {
    await db.$executeRawUnsafe('ALTER TABLE "document_templates" DISABLE TRIGGER USER');
    await db.documentTemplate.deleteMany({ where: { language: "en" } });
    await db.$executeRawUnsafe('ALTER TABLE "document_templates" ENABLE TRIGGER USER');
    expect(await issue("staff", enrollmentA, "en")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    setConverter(async () => {
      throw new PdfUnavailableError();
    });
    expect(await issue("staff", enrollmentA)).toMatchObject({
      ok: false,
      error: { code: "UNAVAILABLE" },
    });
    setConverter(async () => pdfBytes(1));
    expect(await db.issuedDocument.count()).toBe(0);
    expect(await db.documentCounter.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "cur.package.issue" } })).toBe(0);
  });
});

describe("who may issue and read (AC-7..AC-9)", () => {
  it("lets only holders of the grant issue", async () => {
    actorId = "coord1";
    // coordinators hold no cur.package.issue grant at all
    expect(await issue("staff", enrollmentA)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    actorId = "lect";
    expect(await issue("staff", enrollmentA)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    actorId = "sec";
    ok(await issue("staff", enrollmentA));
  });

  it("lets a student issue only for their own enrollment, at most 3 per hour", async () => {
    actorId = "stuA";
    expect(await issue("self", enrollmentOther)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    // a student cannot use the staff mode either
    expect(await issue("staff", enrollmentA)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    for (let i = 0; i < 3; i++) ok(await issue("self", enrollmentA));
    const fourth = await issue("self", enrollmentA);
    expect(fourth).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (!fourth.ok) expect(fourth.error.fieldErrors).toEqual({ enrollmentId: ["limitReached"] });
    // the limit is per student
    actorId = "stuB";
    ok(await issue("self", enrollmentOther));
    // staff are not limited
    actorId = "sec";
    ok(await issue("staff", enrollmentA));
  });

  it("serves reprints to the student of the enrollment, to staff, never to others", async () => {
    const { documentId } = ok(await issue("staff", enrollmentA));
    const doc = await db.issuedDocument.findUniqueOrThrow({ where: { id: documentId } });
    expect(await mayReadDocument({ id: "stuA" }, doc)).toBe(true);
    expect(await mayReadDocument({ id: "sec" }, doc)).toBe(true);
    expect(await mayReadDocument({ id: "stuB" }, doc)).toBe(false);
    expect(await mayReadDocument({ id: "lect" }, doc)).toBe(false);
    expect(await mayReadDocument({ id: "coord2" }, doc)).toBe(false);
  });
});

describe("queries (AC-11)", () => {
  it("searches students in scope with the preview and lists issued packages", async () => {
    await syllabus(pcA, y24, await storedPdf(1));
    const found = await searchStudents({ id: "sec" }, "Ana");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ number: "900001" });
    expect(found[0]!.enrollments[0]).toMatchObject({
      planApproved: true,
      counts: { courses: 3, included: 1, missing: 2, credits: 15 },
    });
    expect(await searchStudents({ id: "sec" }, "9000")).toHaveLength(3);
    expect(await searchStudents({ id: "sec" }, "A")).toEqual([]); // too short
    // a user with no grant sees nobody
    expect(await searchStudents({ id: "coord1" }, "Ana")).toEqual([]);

    ok(await issue("staff", enrollmentA));
    const recent = await recentIssued({ id: "sec" });
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({
      student: "Ana Test (900001)",
      program: "P1",
      cancelled: false,
    });
    expect(await recentIssued({ id: "coord1" })).toEqual([]);
  });

  it("shows a student only their own enrollments and packages", async () => {
    ok(await issue("staff", enrollmentA));
    ok(await issue("staff", enrollmentOther));
    const own = await ownPackages({ id: "stuA" });
    expect(own?.enrollments.map((e) => e.enrollmentId)).toEqual([enrollmentA]);
    expect(own?.issued).toHaveLength(1);
    expect(await ownPackages({ id: "sec" })).toBeNull();
  });
});
