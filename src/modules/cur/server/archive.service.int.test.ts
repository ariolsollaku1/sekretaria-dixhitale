import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { getFilePurpose } from "@/lib/files/purposes";
import { LocalStorage, setStorage } from "@/lib/storage";
import { newStorageKey } from "@/lib/storage/storage";
import "@/modules/org";
import "@/modules/cur";
import { archiveOfYear } from "./archive.queries";
import { ARCHIVE_PURPOSE } from "./archive.purposes";
import * as svc from "./archive.service";
import { registerCurPurposes } from "./syllabus.purposes";

let actorId = "admin";
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
    permission: "cur.archive.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let dir: string;
let storage: LocalStorage;
let prog1: string, prog2: string, dep1: string, dep2: string;
let y24: string, y25: string, y26: string, closed: string;
let plan1: string, plan2: string;
let fileCounter = 0;

async function pending(purpose = ARCHIVE_PURPOSE, by = actorId) {
  const id = `f${String(++fileCounter).padStart(10, "0")}abcdef`;
  const storageKey = newStorageKey(id);
  const bytes = new TextEncoder().encode(`%PDF-1.4 ${id}`);
  await storage.put(storageKey, bytes);
  await db.storedFile.create({
    data: {
      id,
      storageKey,
      purpose,
      fileName: "decision.pdf",
      mimeType: "application/pdf",
      size: bytes.length,
      sha256: "x".repeat(64),
      uploadedById: by,
    },
  });
  return id;
}
const add = async (over: Record<string, unknown> = {}) =>
  run(async (ctx) =>
    svc.addDocument(ctx, {
      kind: "DIPLOMA_FORM",
      academicYearId: y25,
      programId: prog1,
      title: "Forma",
      decisionRef: null,
      decisionDate: null,
      notes: null,
      templateId: null,
      fileId: await pending(),
      ...over,
    } as never),
  );

async function user(id: string, role: string, scope?: { id: string }) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: {
      userId: id,
      role: role as never,
      scopeType: scope ? "DEPARTMENT" : "INSTITUTION",
      scopeId: scope?.id ?? null,
    },
  });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
  storage = new LocalStorage(dir);
  setStorage(storage);
  registerCurPurposes();
});
afterAll(async () => {
  setStorage(undefined);
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "approved_documents", "syllabi", "stored_files", "teaching_assignments", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "user_roles", "study_programs", "departments", "faculties", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
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
          name: code,
          durationYears: 3,
          totalCredits: 180,
        },
      })
      .then((p) => p.id);
  prog1 = await mkProg("P1", dep1);
  prog2 = await mkProg("P2", dep2);
  const mkYear = (code: string, start: string, status: "CLOSED" | "CURRENT" | "PLANNED") =>
    db.academicYear
      .create({
        data: {
          code,
          startDate: new Date(`${start}T00:00:00Z`),
          endDate: new Date(`${Number(start.slice(0, 4)) + 1}-08-31T00:00:00Z`),
          status,
        },
      })
      .then((y) => y.id);
  closed = await mkYear("2023-2024", "2023-09-01", "CLOSED");
  y24 = await mkYear("2024-2025", "2024-09-01", "CURRENT");
  y25 = await mkYear("2025-2026", "2025-09-01", "PLANNED");
  y26 = await mkYear("2026-2027", "2026-09-01", "PLANNED");
  const course = await db.course.create({
    data: {
      code: "CA",
      name: "CA",
      defaultCredits: 6,
      hoursLecture: 30,
      hoursSeminar: 0,
      hoursLab: 0,
      departmentId: dep1,
    },
  });
  const mkPlan = async (programId: string, version: number, validFrom: string) => {
    const p = await db.curriculumPlan.create({
      data: { programId, version, validFromAcademicYearId: validFrom, status: "DRAFT" },
    });
    await db.planCourse.create({
      data: {
        planId: p.id,
        courseId: course.id,
        yearOfStudy: 1,
        semester: 1,
        credits: 6,
        hoursLecture: 30,
        hoursSeminar: 0,
        hoursLab: 0,
      },
    });
    await db.curriculumPlan.update({ where: { id: p.id }, data: { status: "APPROVED" } });
    return p.id;
  };
  plan1 = await mkPlan(prog1, 1, y25);
  plan2 = await mkPlan(prog1, 2, y26);
  await user("admin", "sysadmin");
  await user("secretary1", "secretary");
  await user("head1", "head_of_department", { id: dep1 });
  await user("head2", "head_of_department", { id: dep2 });
  await user("coord1", "program_coordinator", { id: dep1 });
  await user("quality1", "quality");
  await user("student1", "student");
  actorId = "admin";
});

describe("addDocument (AC-1, AC-2)", () => {
  it("creates an active document, attaches the file and audits; closed years are fine", async () => {
    const a = ok(await add({ decisionRef: " 12/2025 ", decisionDate: "2025-07-01" }));
    const row = await db.approvedDocument.findUniqueOrThrow({ where: { id: a.documentId } });
    expect(row).toMatchObject({ status: "ACTIVE", programId: prog1, createdById: "admin" });
    expect(row.decisionDate?.toISOString().slice(0, 10)).toBe("2025-07-01");
    expect(await db.storedFile.findUniqueOrThrow({ where: { id: row.fileId } })).toMatchObject({
      status: "ATTACHED",
      entityType: "ApprovedDocument",
      entityId: row.id,
    });
    expect(await db.auditLog.count({ where: { action: "cur.archive.create" } })).toBe(1);
    ok(await add({ academicYearId: closed }));
    ok(await add({ programId: null, kind: "DECISION" }));
  });
  it("refuses foreign or wrong files and unknown references", async () => {
    const bad = async (over: Record<string, unknown>, code: string) =>
      expect(await add(over)).toMatchObject({ ok: false, error: { code } });
    await bad({ fileId: "nope" }, "VALIDATION");
    await bad({ fileId: await pending("syllabus") }, "VALIDATION");
    await bad({ fileId: await pending(ARCHIVE_PURPOSE, "head1") }, "VALIDATION");
    await bad({ academicYearId: "nope" }, "VALIDATION");
    await bad({ programId: "nope" }, "FORBIDDEN");
    await bad({ templateId: "nope" }, "VALIDATION");
    expect(await db.approvedDocument.count()).toBe(0);
  });
  it("refuses the same file twice", async () => {
    const fileId = await pending();
    ok(await add({ fileId }));
    expect(await add({ fileId })).toMatchObject({ ok: false });
  });
});

describe("write scope (AC-8)", () => {
  it("lets a head of department file only for their programs, not for the institution", async () => {
    actorId = "head1";
    ok(await add());
    expect(await add({ programId: prog2 })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await add({ programId: null })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
  it("lets the secretariat file for the institution, and refuses read-only and other roles", async () => {
    actorId = "secretary1";
    ok(await add({ programId: null }));
    for (const id of ["coord1", "quality1", "student1"]) {
      actorId = id;
      expect(await add()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
  });
  it("applies the scope to edit and withdraw", async () => {
    const { documentId } = ok(await add({ programId: prog2 }));
    actorId = "head1";
    const patch = {
      title: "x",
      decisionRef: null,
      decisionDate: null,
      notes: null,
      templateId: null,
    };
    expect(await run((c) => svc.updateDocument(c, documentId, patch))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await run((c) => svc.withdrawDocument(c, documentId, "why"))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
});

describe("edit, withdraw and the freeze trigger (AC-3, AC-4)", () => {
  const patch = {
    title: "Forma e re",
    decisionRef: "7",
    decisionDate: "2025-06-01",
    notes: "n",
    templateId: null,
  };
  it("edits details of an active document and audits", async () => {
    const { documentId } = ok(await add());
    ok(await run((c) => svc.updateDocument(c, documentId, patch)));
    expect(
      await db.approvedDocument.findUniqueOrThrow({ where: { id: documentId } }),
    ).toMatchObject({ title: "Forma e re", decisionRef: "7", notes: "n", updatedById: "admin" });
    expect(await db.auditLog.count({ where: { action: "cur.archive.update" } })).toBe(1);
  });
  it("withdraws once with a reason, keeps the row and refuses further edits", async () => {
    const { documentId } = ok(await add());
    ok(await run((c) => svc.withdrawDocument(c, documentId, "wrong scan")));
    expect(
      await db.approvedDocument.findUniqueOrThrow({ where: { id: documentId } }),
    ).toMatchObject({ status: "WITHDRAWN", withdrawReason: "wrong scan", withdrawnById: "admin" });
    expect(await run((c) => svc.withdrawDocument(c, documentId, "again"))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await run((c) => svc.updateDocument(c, documentId, patch))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await db.auditLog.count({ where: { action: "cur.archive.withdraw" } })).toBe(1);
  });
  it("refuses delete and changes of kind, year, program and file in the database", async () => {
    const { documentId } = ok(await add());
    await expect(db.approvedDocument.delete({ where: { id: documentId } })).rejects.toThrow();
    await expect(
      db.approvedDocument.update({ where: { id: documentId }, data: { kind: "OTHER" } }),
    ).rejects.toThrow();
    await expect(
      db.approvedDocument.update({ where: { id: documentId }, data: { academicYearId: y26 } }),
    ).rejects.toThrow();
    await expect(
      db.approvedDocument.update({ where: { id: documentId }, data: { programId: prog2 } }),
    ).rejects.toThrow();
    await expect(
      db.approvedDocument.update({ where: { id: documentId }, data: { fileId: "other" } }),
    ).rejects.toThrow();
    await expect(
      db.approvedDocument.update({
        where: { id: documentId },
        data: { status: "WITHDRAWN" },
      }),
    ).rejects.toThrow(); // no reason: check constraint
  });
});

describe("archiveOfYear (AC-5..AC-7)", () => {
  async function approvedSyllabus(planId: string, yearId: string) {
    const pc = await db.planCourse.findFirstOrThrow({ where: { planId } });
    await db.syllabus.create({
      data: {
        planCourseId: pc.id,
        academicYearId: yearId,
        version: 1,
        status: "APPROVED",
        fileId: `syl${planId}${yearId}`,
        approvedAt: new Date(),
      },
    });
  }
  it("shows the plan in force, syllabus coverage and the documents of the year", async () => {
    await approvedSyllabus(plan1, y25);
    ok(await add({ title: "Forma 25" }));
    ok(await add({ title: "Vendim", kind: "DECISION", programId: null }));
    ok(await add({ title: "Forma 26", academicYearId: y26 }));
    const a25 = (await archiveOfYear({ id: "admin" }, y25))!;
    const p1 = a25.programs.find((p) => p.id === prog1)!;
    expect(p1.plan).toMatchObject({ id: plan1, version: 1 });
    expect(p1.syllabi).toEqual({ approved: 1, total: 1 });
    expect(p1.documents.map((d) => d.title)).toEqual(["Forma 25"]);
    expect(a25.institution.map((d) => d.title)).toEqual(["Vendim"]);
    // a year before any plan, and a later year with the next plan
    const a24 = (await archiveOfYear({ id: "admin" }, y24))!;
    expect(a24.programs.find((p) => p.id === prog1)!.plan).toBeNull();
    const a26 = (await archiveOfYear({ id: "admin" }, y26))!;
    expect(a26.programs.find((p) => p.id === prog1)!.plan).toMatchObject({ id: plan2, version: 2 });
    expect(a26.programs.find((p) => p.id === prog1)!.syllabi).toEqual({ approved: 0, total: 1 });
    // the program filter
    const only = (await archiveOfYear({ id: "admin" }, y25, prog2))!;
    expect(only.programs.map((p) => p.id)).toEqual([prog2]);
    expect(only.institution).toEqual([]);
    expect(await archiveOfYear({ id: "admin" }, "nope")).toBeNull();
  });
  it("limits programs and documents to the viewer's scope; institution documents stay visible", async () => {
    ok(await add({ title: "P1 doc" }));
    ok(await add({ title: "P2 doc", programId: prog2 }));
    ok(await add({ title: "All", programId: null, kind: "OTHER" }));
    const head = (await archiveOfYear({ id: "head1" }, y25))!;
    expect(head.programs.map((p) => p.id)).toEqual([prog1]);
    expect(head.programs[0]!.writable).toBe(true);
    expect(head.institution.map((d) => d.title)).toEqual(["All"]);
    expect(head.institutionWritable).toBe(false);
    const other = (await archiveOfYear({ id: "head2" }, y25))!;
    expect(other.programs.flatMap((p) => p.documents.map((d) => d.title))).toEqual(["P2 doc"]);
    const none = (await archiveOfYear({ id: "student1" }, y25))!;
    expect(none.programs).toEqual([]);
    expect(none.institution).toEqual([]);
  });
  it("hides withdrawn documents from read-only viewers", async () => {
    const { documentId } = ok(await add({ title: "Old" }));
    ok(await run((c) => svc.withdrawDocument(c, documentId, "replaced")));
    const titles = async (id: string) =>
      (await archiveOfYear({ id }, y25))!.programs.flatMap((p) => p.documents.map((d) => d.status));
    expect(await titles("secretary1")).toEqual(["WITHDRAWN"]);
    expect(await titles("quality1")).toEqual([]);
  });
});

describe("file access (AC-9)", () => {
  it("serves an active file to viewers in scope, a withdrawn one to writers only", async () => {
    const { documentId } = ok(await add());
    const row = await db.approvedDocument.findUniqueOrThrow({ where: { id: documentId } });
    const file = {
      id: row.fileId,
      purpose: ARCHIVE_PURPOSE,
      status: "ATTACHED" as const,
      entityType: "ApprovedDocument",
      entityId: documentId,
      uploadedById: "admin",
    };
    const can = (id: string) => getFilePurpose(ARCHIVE_PURPOSE)!.canRead({ id }, file);
    expect(await can("coord1")).toBe(true);
    expect(await can("head1")).toBe(true);
    expect(await can("head2")).toBe(false);
    expect(await can("student1")).toBe(false);
    ok(await run((c) => svc.withdrawDocument(c, documentId, "x")));
    expect(await can("quality1")).toBe(false);
    expect(await can("secretary1")).toBe(true);
  });
});
