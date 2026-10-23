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
import { board, history } from "./syllabus.queries";
import { registerCurPurposes, SYLLABUS_PURPOSE } from "./syllabus.purposes";
import * as svc from "./syllabus.service";

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
    permission: "cur.syllabus.write",
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
let plan1: string, plan1b: string, draftPlan: string;
let pcA: string, pcB: string, pcAv2: string, pcDraft: string, pcP2: string;
let fileCounter = 0;

/** A pending PDF the current actor has uploaded. */
async function pending(
  content = `%PDF-1.4 file ${++fileCounter}`,
  purpose = SYLLABUS_PURPOSE,
  by = actorId,
) {
  const id = `f${String(++fileCounter).padStart(10, "0")}abcdef`;
  const storageKey = newStorageKey(id);
  const bytes = new TextEncoder().encode(content);
  await storage.put(storageKey, bytes);
  await db.storedFile.create({
    data: {
      id,
      storageKey,
      purpose,
      fileName: "syllabus.pdf",
      mimeType: "application/pdf",
      size: bytes.length,
      sha256: "x".repeat(64),
      uploadedById: by,
    },
  });
  return id;
}
const upload = async (over: Record<string, unknown> = {}) =>
  run(async (ctx) =>
    svc.uploadSyllabus(ctx, {
      planCourseId: pcA,
      academicYearId: y25,
      fileId: await pending(),
      ...over,
    } as never),
  );
const approve = (id: string) => run((ctx) => svc.approve(ctx, id));

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
  dir = await mkdtemp(join(tmpdir(), "syl-"));
  storage = new LocalStorage(dir);
  setStorage(storage);
  registerCurPurposes();
});
afterAll(async () => {
  setStorage(undefined);
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.$executeRawUnsafe('ALTER TABLE "syllabi" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "syllabi", "stored_files", "teaching_assignments", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "user_roles", "study_programs", "departments", "faculties", "academic_years", "system_settings" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "syllabi" ENABLE TRIGGER USER');
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
  y24 = await mkYear("2024-2025", "2024-09-01", "CURRENT").catch(() => closed);
  y25 = await mkYear("2025-2026", "2025-09-01", "PLANNED");
  y26 = await mkYear("2026-2027", "2026-09-01", "PLANNED");
  const mkCourse = (code: string, departmentId = dep1) =>
    db.course
      .create({
        data: {
          code,
          name: code,
          defaultCredits: 6,
          hoursLecture: 30,
          hoursSeminar: 0,
          hoursLab: 0,
          departmentId,
        },
      })
      .then((c) => c.id);
  const [cA, cB, cP2] = [await mkCourse("CA"), await mkCourse("CB"), await mkCourse("CP2", dep2)];
  const mkPlan = (programId: string, version: number, status: "DRAFT" | "APPROVED") =>
    db.curriculumPlan
      .create({ data: { programId, version, validFromAcademicYearId: y25, status } })
      .then((p) => p.id);
  const mkPc = (planId: string, courseId: string) =>
    db.planCourse
      .create({
        data: {
          planId,
          courseId,
          yearOfStudy: 1,
          semester: 1,
          credits: 6,
          hoursLecture: 30,
          hoursSeminar: 0,
          hoursLab: 0,
        },
      })
      .then((p) => p.id);
  draftPlan = await mkPlan(prog1, 99, "DRAFT");
  pcDraft = await mkPc(draftPlan, cA);
  plan1 = await mkPlan(prog1, 1, "DRAFT");
  pcA = await mkPc(plan1, cA);
  pcB = await mkPc(plan1, cB);
  plan1b = await mkPlan(prog1, 2, "DRAFT");
  pcAv2 = await mkPc(plan1b, cA);
  const plan2 = await mkPlan(prog2, 1, "DRAFT");
  pcP2 = await mkPc(plan2, cP2);
  // courses can only be added to drafts: approve once they are in
  await db.curriculumPlan.updateMany({
    where: { id: { in: [plan1, plan1b, plan2] } },
    data: { status: "APPROVED" },
  });
  await user("admin", "sysadmin");
  await user("head1", "head_of_department", { id: dep1 });
  await user("head2", "head_of_department", { id: dep2 });
  await user("student1", "student");
  await user("lecturer1", "lecturer");
  actorId = "admin";
});

describe("uploadSyllabus (AC-1, AC-2, AC-10)", () => {
  it("creates drafts with increasing versions, attaches the file and audits", async () => {
    const a = ok(await upload());
    const b = ok(await upload());
    expect([a.version, b.version]).toEqual([1, 2]);
    const row = await db.syllabus.findUniqueOrThrow({ where: { id: a.syllabusId } });
    expect(row).toMatchObject({ status: "DRAFT", createdById: "admin" });
    expect(await db.storedFile.findUniqueOrThrow({ where: { id: row.fileId } })).toMatchObject({
      status: "ATTACHED",
      entityType: "Syllabus",
      entityId: row.id,
    });
    expect(await db.auditLog.count({ where: { action: "cur.syllabus.create" } })).toBe(2);
  });
  it("refuses draft plans, closed years, foreign or wrong files", async () => {
    expect(await upload({ planCourseId: pcDraft })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await upload({ academicYearId: closed })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await upload({ fileId: "nope" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await upload({ fileId: await pending("x", "form-attachment") })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await upload({ fileId: await pending("x", SYLLABUS_PURPOSE, "head1") })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await db.syllabus.count()).toBe(0);
  });
  it("refuses the same file twice", async () => {
    const fileId = await pending();
    ok(await upload({ fileId }));
    expect(await upload({ fileId })).toMatchObject({ ok: false });
  });
  it("writes only inside the user's scope", async () => {
    actorId = "head1";
    ok(await upload());
    expect(await upload({ planCourseId: pcP2 })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    actorId = "student1";
    expect(await upload()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("drafts (AC-3)", () => {
  it("replaces the file, edits notes and deletes", async () => {
    const { syllabusId } = ok(await upload({ notes: " first " }));
    const before = await db.syllabus.findUniqueOrThrow({ where: { id: syllabusId } });
    expect(before.notes).toBe("first");
    const next = await pending();
    ok(await run((ctx) => svc.updateDraft(ctx, syllabusId, { fileId: next, notes: "second" })));
    const after = await db.syllabus.findUniqueOrThrow({ where: { id: syllabusId } });
    expect(after).toMatchObject({ fileId: next, notes: "second" });
    expect(
      (await db.storedFile.findUniqueOrThrow({ where: { id: before.fileId } })).deletedAt,
    ).not.toBeNull();
    ok(await run((ctx) => svc.deleteDraft(ctx, syllabusId)));
    expect(await db.syllabus.count()).toBe(0);
    expect(
      (await db.storedFile.findUniqueOrThrow({ where: { id: next } })).deletedAt,
    ).not.toBeNull();
    expect(
      await db.auditLog.count({
        where: { action: { in: ["cur.syllabus.update", "cur.syllabus.delete"] } },
      }),
    ).toBe(2);
  });
  it("cannot touch approved versions", async () => {
    const { syllabusId } = ok(await upload());
    ok(await approve(syllabusId));
    expect(await run((ctx) => svc.updateDraft(ctx, syllabusId, { notes: "x" }))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await run((ctx) => svc.deleteDraft(ctx, syllabusId))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });
});

describe("approve (AC-4, AC-5)", () => {
  it("archives the previously approved version", async () => {
    const a = ok(await upload());
    ok(await approve(a.syllabusId));
    const b = ok(await upload());
    ok(await approve(b.syllabusId));
    const rows = await db.syllabus.findMany({ orderBy: { version: "asc" } });
    expect(rows.map((r) => r.status)).toEqual(["ARCHIVED", "APPROVED"]);
    expect(rows[1]).toMatchObject({ approvedById: "admin" });
    expect(
      await db.auditLog.count({
        where: { action: { in: ["cur.syllabus.approve", "cur.syllabus.archive"] } },
      }),
    ).toBe(3);
    expect(await approve(b.syllabusId)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
  it("is frozen in the database", async () => {
    const a = ok(await upload());
    ok(await approve(a.syllabusId));
    await expect(
      db.syllabus.update({ where: { id: a.syllabusId }, data: { notes: "hack" } }),
    ).rejects.toThrow();
    await expect(db.syllabus.delete({ where: { id: a.syllabusId } })).rejects.toThrow();
    await expect(
      db.syllabus.update({ where: { id: a.syllabusId }, data: { status: "DRAFT" } }),
    ).rejects.toThrow();
    await db.syllabus.update({ where: { id: a.syllabusId }, data: { status: "ARCHIVED" } });
    await expect(
      db.syllabus.update({ where: { id: a.syllabusId }, data: { status: "APPROVED" } }),
    ).rejects.toThrow();
  });
  it("allows only one approved version per course and year", async () => {
    const a = ok(await upload());
    const b = ok(await upload());
    await db.syllabus.update({
      where: { id: a.syllabusId },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    await expect(
      db.syllabus.update({
        where: { id: b.syllabusId },
        data: { status: "APPROVED", approvedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
});

describe("board and history (AC-6, AC-8)", () => {
  it("shows states, a waiting draft and the missing count", async () => {
    const a = ok(await upload());
    ok(await approve(a.syllabusId));
    ok(await upload()); // a draft next to the approved one
    ok(await upload({ planCourseId: pcB })); // a draft only
    const staff = await board({ id: "admin" }, plan1, y25);
    expect(
      staff!.rows.map((r) => [
        r.code,
        r.state,
        r.approved?.version ?? null,
        r.draft?.version ?? null,
      ]),
    ).toEqual([
      ["CA", "approved", 1, 2],
      ["CB", "draft", null, 1],
    ]);
    expect(staff!.missing).toBe(1);
    expect(staff!.staff).toBe(true);
    const other = await board({ id: "admin" }, plan1, y26);
    expect(other!.rows.map((r) => r.state)).toEqual(["missing", "missing"]);
  });
  it("shows students only approved syllabi and no history", async () => {
    const a = ok(await upload());
    ok(await approve(a.syllabusId));
    ok(await upload());
    ok(await upload({ planCourseId: pcB }));
    const seen = await board({ id: "student1" }, plan1, y25);
    expect(seen!.staff).toBe(false);
    expect(seen!.rows.map((r) => [r.state, r.draft])).toEqual([
      ["approved", null],
      ["missing", null],
    ]);
    expect(await history({ id: "student1" }, pcA, y25)).toBeNull();
    expect(await board({ id: "student1" }, draftPlan, y25)).toBeNull(); // draft plans are not offered
  });
  it("lists every version for staff, newest first", async () => {
    const a = ok(await upload());
    ok(await approve(a.syllabusId));
    ok(await upload({ notes: "revised" }));
    const h = await history({ id: "admin" }, pcA, y25);
    expect(h!.entries.map((e) => [e.version, e.status, e.createdBy, e.fileName])).toEqual([
      [2, "DRAFT", "admin", "syllabus.pdf"],
      [1, "APPROVED", "admin", "syllabus.pdf"],
    ]);
    expect(h!.entries[0]!.notes).toBe("revised");
    expect(h!.entries[1]!.approvedBy).toBe("admin");
    expect(await history({ id: "head2" }, pcA, y25)).toBeNull(); // outside the department
  });
});

describe("carryForward (AC-7)", () => {
  const bytesOf = async (fileId: string) => {
    const f = await db.storedFile.findUniqueOrThrow({ where: { id: fileId } });
    return new TextDecoder().decode(await storage.read(f.storageKey));
  };
  it("copies the latest earlier approved syllabus as a draft, through any plan of the program", async () => {
    const a = ok(
      await run(async (ctx) =>
        svc.uploadSyllabus(ctx, {
          planCourseId: pcA,
          academicYearId: y24,
          fileId: await pending("%PDF original"),
        }),
      ),
    );
    ok(await approve(a.syllabusId));
    const result = ok(
      await run((ctx) => svc.carryForward(ctx, { planId: plan1b, academicYearId: y25 })),
    );
    expect(result).toEqual({ created: 1, existing: 0, noSource: 0, sourceMissing: 0 });
    const copy = await db.syllabus.findFirstOrThrow({
      where: { planCourseId: pcAv2, academicYearId: y25 },
    });
    const source = await db.syllabus.findUniqueOrThrow({ where: { id: a.syllabusId } });
    expect(copy).toMatchObject({ status: "DRAFT", version: 1 });
    expect(copy.fileId).not.toBe(source.fileId);
    expect(await bytesOf(copy.fileId)).toBe("%PDF original");
    expect(await db.storedFile.findUniqueOrThrow({ where: { id: copy.fileId } })).toMatchObject({
      status: "ATTACHED",
      entityId: copy.id,
    });
    expect(
      await db.auditLog.count({ where: { action: "cur.syllabus.create", entityId: copy.id } }),
    ).toBe(1);

    // again: the course now has a draft; the other course has no source
    const again = ok(
      await run((ctx) => svc.carryForward(ctx, { planId: plan1b, academicYearId: y25 })),
    );
    expect(again).toEqual({ created: 0, existing: 1, noSource: 0, sourceMissing: 0 });
    const full = ok(
      await run((ctx) => svc.carryForward(ctx, { planId: plan1, academicYearId: y25 })),
    );
    expect(full).toEqual({ created: 1, existing: 0, noSource: 1, sourceMissing: 0 });
  });
  it("ignores syllabi of the same or a later year and drafts", async () => {
    const later = ok(await upload({ academicYearId: y26 }));
    ok(await approve(later.syllabusId));
    ok(await upload({ planCourseId: pcB, academicYearId: y24 })); // a draft is no source
    const r = ok(await run((ctx) => svc.carryForward(ctx, { planId: plan1, academicYearId: y25 })));
    expect(r).toEqual({ created: 0, existing: 0, noSource: 2, sourceMissing: 0 });
  });
  it("reports a missing source file and keeps going", async () => {
    const a = ok(await upload({ academicYearId: y24 }));
    ok(await approve(a.syllabusId));
    const source = await db.syllabus.findUniqueOrThrow({ where: { id: a.syllabusId } });
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: source.fileId } });
    await storage.delete(file.storageKey);
    const r = ok(await run((ctx) => svc.carryForward(ctx, { planId: plan1, academicYearId: y25 })));
    expect(r).toMatchObject({ created: 0, sourceMissing: 1 });
  });
  it("refuses draft plans, closed years and other programs", async () => {
    expect(
      await run((ctx) => svc.carryForward(ctx, { planId: draftPlan, academicYearId: y25 })),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(
      await run((ctx) => svc.carryForward(ctx, { planId: plan1, academicYearId: closed })),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    actorId = "head2";
    expect(
      await run((ctx) => svc.carryForward(ctx, { planId: plan1, academicYearId: y25 })),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("file read rule (AC-9)", () => {
  it("opens approved syllabi to view holders and drafts to staff in scope", async () => {
    const a = ok(await upload());
    const draft = await db.syllabus.findUniqueOrThrow({ where: { id: a.syllabusId } });
    const view = (userId: string) =>
      getFilePurpose(SYLLABUS_PURPOSE)!.canRead(
        { id: userId },
        {
          id: draft.fileId,
          purpose: SYLLABUS_PURPOSE,
          status: "ATTACHED",
          entityType: "Syllabus",
          entityId: draft.id,
          uploadedById: "admin",
        },
      );
    expect(await view("student1")).toBe(false);
    expect(await view("head2")).toBe(false);
    expect(await view("head1")).toBe(true);
    ok(await approve(a.syllabusId));
    expect(await view("student1")).toBe(true);
    expect(await view("lecturer1")).toBe(true);
    expect(
      await getFilePurpose(SYLLABUS_PURPOSE)!.canRead(
        { id: "student1" },
        {
          id: "x",
          purpose: SYLLABUS_PURPOSE,
          status: "ATTACHED",
          entityType: "Other",
          entityId: draft.id,
          uploadedById: "admin",
        },
      ),
    ).toBe(false);
  });
});
