import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { blockingDependents, registerPlanDependent, resetPlanDependents } from "@/modules/org";
import "@/modules/cur";
import { blockingCourseDependents } from "./course-dependents";
import { getPlan, planWhere } from "./plan.queries";
import * as plans from "./plan.service";

let actorId = "admin";
function run<R>(fn: (ctx: ActionContext) => Promise<R>, reason?: string): Promise<ActionResult<R>> {
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
    permission: "cur.plan.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let dep1: string, dep2: string, prog1: string, prog2: string, year: string;
let c1: string, c2: string, c3: string, inactiveCourse: string;

async function user(
  id: string,
  role:
    | "sysadmin"
    | "program_coordinator"
    | "head_of_department"
    | "lecturer"
    | "student"
    | "secretary",
  scope?: { type: "PROGRAM" | "DEPARTMENT"; id: string },
) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: {
      userId: id,
      role,
      scopeType: scope?.type ?? (role === "student" ? "SELF" : "INSTITUTION"),
      scopeId: scope?.id ?? null,
    },
  });
}
const newPlan = (programId = prog1, over: Record<string, unknown> = {}) =>
  run((ctx) =>
    plans.createPlan(ctx, {
      programId,
      validFromAcademicYearId: year,
      copyFromPlanId: null,
      notes: null,
      ...over,
    }),
  );
const add = (planId: string, courseId: string, over: Record<string, unknown> = {}) =>
  run((ctx) =>
    plans.addPlanCourse(ctx, {
      planId,
      courseId,
      yearOfStudy: 1,
      semester: 1,
      isElective: false,
      ...over,
    } as never),
  );

beforeEach(async () => {
  resetPlanDependents();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "curriculum_plans", "courses", "course_categories", "user_roles", "study_programs", "departments", "faculties", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  dep1 = (await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } })).id;
  dep2 = (await db.department.create({ data: { code: "D2", name: "D2", facultyId: f.id } })).id;
  const mkProg = (code: string, departmentId: string, durationYears = 3) =>
    db.studyProgram
      .create({
        data: {
          departmentId,
          cycle: "FIRST",
          code,
          name: code,
          durationYears,
          totalCredits: durationYears * 60,
        },
      })
      .then((p) => p.id);
  prog1 = await mkProg("P1", dep1);
  prog2 = await mkProg("P2", dep2);
  year = (
    await db.academicYear.create({
      data: {
        code: "2026-2027",
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2027-08-31T00:00:00Z"),
        status: "CURRENT",
      },
    })
  ).id;
  const cat = await db.courseCategory.create({
    data: { code: "CORE", nameSq: "Bazë", nameEn: "Core" },
  });
  const mkCourse = (code: string, over: Record<string, unknown> = {}) =>
    db.course
      .create({
        data: {
          code,
          name: code,
          defaultCredits: 6,
          categoryId: cat.id,
          hoursLecture: 30,
          hoursSeminar: 15,
          hoursLab: 0,
          departmentId: dep1,
          ...over,
        },
      })
      .then((c) => c.id);
  c1 = await mkCourse("C1");
  c2 = await mkCourse("C2", { defaultCredits: 8 });
  c3 = await mkCourse("C3");
  inactiveCourse = await mkCourse("OLD", { active: false });
  await user("admin", "sysadmin");
  await user("coord", "program_coordinator", { type: "PROGRAM", id: prog1 });
  await user("head", "head_of_department", { type: "DEPARTMENT", id: dep1 });
  actorId = "admin";
});

describe("create, versions and copy (AC-1, AC-6)", () => {
  it("creates drafts with the next version per program and audits", async () => {
    const a = ok(await newPlan());
    const b = ok(await newPlan());
    const other = ok(await newPlan(prog2));
    expect([a.version, b.version, other.version]).toEqual([1, 2, 1]);
    expect(await db.curriculumPlan.findUniqueOrThrow({ where: { id: a.planId } })).toMatchObject({
      status: "DRAFT",
      approvedAt: null,
    });
    expect(await db.auditLog.count({ where: { action: "cur.plan.create" } })).toBe(3);
  });

  it("copies courses into a new version, skipping courses that were deactivated meanwhile", async () => {
    const a = ok(await newPlan());
    ok(await add(a.planId, c1, { credits: 7, isElective: true, hoursLab: 10 }));
    ok(await add(a.planId, c2, { yearOfStudy: 2, semester: 2 }));
    await db.course.update({ where: { id: c2 }, data: { active: false } });
    const b = ok(await newPlan(prog1, { copyFromPlanId: a.planId }));
    expect(b).toMatchObject({ version: 2, copied: 1, skipped: 1 });
    expect(await db.planCourse.findFirstOrThrow({ where: { planId: b.planId } })).toMatchObject({
      courseId: c1,
      credits: 7,
      isElective: true,
      hoursLab: 10,
    });
  });

  it("refuses an unknown year, a source plan of another program and a missing program", async () => {
    const other = ok(await newPlan(prog2));
    expect(await newPlan(prog1, { validFromAcademicYearId: "nope" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await newPlan(prog1, { copyFromPlanId: other.planId })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await newPlan("missing")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await db.studyProgram.update({ where: { id: prog1 }, data: { active: false } });
    expect(await newPlan()).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});

describe("plan courses (AC-2, AC-3)", () => {
  it("takes credits, category and hours from the catalog unless given", async () => {
    const { planId } = ok(await newPlan());
    ok(await add(planId, c2));
    const row = await db.planCourse.findFirstOrThrow({ where: { planId } });
    expect(row).toMatchObject({
      credits: 8,
      hoursLecture: 30,
      hoursSeminar: 15,
      hoursLab: 0,
      isElective: false,
    });
    expect(row.categoryId).not.toBeNull();
    ok(await add(planId, c1, { categoryId: null, credits: 0 }));
    expect(await db.planCourse.findFirstOrThrow({ where: { planId, courseId: c1 } })).toMatchObject(
      { categoryId: null, credits: 0 },
    );
  });

  it("refuses duplicates, inactive or unknown courses and out-of-range values", async () => {
    const { planId } = ok(await newPlan());
    ok(await add(planId, c1));
    for (const [courseId, over] of [
      [c1, {}],
      [inactiveCourse, {}],
      ["nope", {}],
      [c3, { yearOfStudy: 4 }],
      [c3, { semester: 3 }],
      [c3, { credits: 61 }],
      [c3, { hoursLab: 501 }],
    ] as const) {
      expect(await add(planId, courseId, over)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    }
    expect(await db.planCourse.count({ where: { planId } })).toBe(1);
  });

  it("updates and removes rows with audit entries", async () => {
    const { planId } = ok(await newPlan());
    const { planCourseId } = ok(await add(planId, c1));
    ok(
      await run((ctx) =>
        plans.updatePlanCourse(ctx, {
          planCourseId,
          yearOfStudy: 2,
          semester: 2,
          credits: 5,
          categoryId: null,
          hoursLecture: 1,
          hoursSeminar: 2,
          hoursLab: 3,
          isElective: true,
        }),
      ),
    );
    expect(await db.planCourse.findUniqueOrThrow({ where: { id: planCourseId } })).toMatchObject({
      yearOfStudy: 2,
      credits: 5,
      isElective: true,
      hoursLab: 3,
    });
    expect(
      await run((ctx) =>
        plans.updatePlanCourse(ctx, {
          planCourseId,
          yearOfStudy: 9,
          semester: 1,
          credits: 5,
          categoryId: null,
          hoursLecture: 0,
          hoursSeminar: 0,
          hoursLab: 0,
          isElective: false,
        }),
      ),
    ).toMatchObject({ ok: false });
    ok(await run((ctx) => plans.removePlanCourse(ctx, planCourseId)));
    expect(await db.planCourse.count()).toBe(0);
    const actions = (
      await db.auditLog.findMany({
        where: { action: { startsWith: "cur.plan_course" } },
        orderBy: { at: "asc" },
      })
    ).map((a) => a.action);
    expect(actions).toEqual([
      "cur.plan_course.add",
      "cur.plan_course.update",
      "cur.plan_course.remove",
    ]);
  });
});

describe("approval and freezing (AC-4, AC-7)", () => {
  it("refuses to approve an empty plan, approves with who and when, then freezes it", async () => {
    const { planId } = ok(await newPlan());
    expect(await run((ctx) => plans.approvePlan(ctx, planId))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    const { planCourseId } = ok(await add(planId, c1));
    ok(await run((ctx) => plans.approvePlan(ctx, planId)));
    const plan = await db.curriculumPlan.findUniqueOrThrow({ where: { id: planId } });
    expect(plan).toMatchObject({ status: "APPROVED", approvedById: "admin" });
    expect(plan.approvedAt).not.toBeNull();

    // service refuses every change
    expect(await add(planId, c2)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await run((ctx) => plans.removePlanCourse(ctx, planCourseId))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(
      await run((ctx) =>
        plans.updatePlan(ctx, planId, { validFromAcademicYearId: year, notes: "x" }),
      ),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await run((ctx) => plans.deleteDraftPlan(ctx, planId))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await run((ctx) => plans.approvePlan(ctx, planId))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("is frozen in the database too", async () => {
    const { planId } = ok(await newPlan());
    const { planCourseId } = ok(await add(planId, c1));
    ok(await run((ctx) => plans.approvePlan(ctx, planId)));
    await expect(
      db.planCourse.update({ where: { id: planCourseId }, data: { credits: 1 } }),
    ).rejects.toThrow(/frozen/);
    await expect(db.planCourse.delete({ where: { id: planCourseId } })).rejects.toThrow(/frozen/);
    await expect(
      db.planCourse.create({
        data: { planId, courseId: c2, yearOfStudy: 1, semester: 1, credits: 1 },
      }),
    ).rejects.toThrow(/frozen/);
    await expect(
      db.curriculumPlan.update({ where: { id: planId }, data: { notes: "x" } }),
    ).rejects.toThrow(/frozen/);
    await expect(
      db.curriculumPlan.update({ where: { id: planId }, data: { status: "DRAFT" } }),
    ).rejects.toThrow(/frozen/);
    await expect(db.curriculumPlan.delete({ where: { id: planId } })).rejects.toThrow(/frozen/);
  });
});

describe("archive and delete (AC-8)", () => {
  it("archives an approved plan with a reason; an archived plan stays frozen", async () => {
    const { planId } = ok(await newPlan());
    ok(await add(planId, c1));
    expect(await run((ctx) => plans.archivePlan(ctx, planId), "x")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    }); // not approved
    ok(await run((ctx) => plans.approvePlan(ctx, planId)));
    ok(await run((ctx) => plans.archivePlan(ctx, planId), "Replaced by version 2"));
    expect(await db.curriculumPlan.findUniqueOrThrow({ where: { id: planId } })).toMatchObject({
      status: "ARCHIVED",
    });
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { action: "cur.plan.archive" } })).reason,
    ).toBe("Replaced by version 2");
    await expect(
      db.curriculumPlan.update({ where: { id: planId }, data: { status: "APPROVED" } }),
    ).rejects.toThrow(/frozen/);
  });

  it("is blocked by a registered dependent", async () => {
    const { planId } = ok(await newPlan());
    ok(await add(planId, c1));
    ok(await run((ctx) => plans.approvePlan(ctx, planId)));
    registerPlanDependent({
      id: "org.cohorts",
      labelKey: "org.dependents.cohorts",
      countActive: async () => 2,
    });
    const r = await run((ctx) => plans.archivePlan(ctx, planId), "x");
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (!r.ok) expect(r.error.message).toContain("HAS_DEPENDENTS:org.dependents.cohorts=2");
  });

  it("deletes a draft with its courses and an audit entry", async () => {
    const { planId } = ok(await newPlan());
    ok(await add(planId, c1));
    ok(await run((ctx) => plans.deleteDraftPlan(ctx, planId)));
    expect(await db.curriculumPlan.count()).toBe(0);
    expect(await db.planCourse.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "cur.plan.delete" } })).toBe(1);
  });
});

describe("dependents of courses and programs (AC-9)", () => {
  it("blocks deactivation while a draft or approved plan uses them", async () => {
    const { planId } = ok(await newPlan());
    ok(await add(planId, c1));
    expect((await blockingCourseDependents(c1)).map((b) => b.id)).toEqual(["cur.plans"]);
    expect((await blockingDependents(prog1)).map((b) => b.id)).toContain("cur.plans");
    expect(await blockingCourseDependents(c3)).toEqual([]);
    expect((await blockingDependents(prog2)).map((b) => b.id)).not.toContain("cur.plans");
    ok(await run((ctx) => plans.approvePlan(ctx, planId)));
    ok(await run((ctx) => plans.archivePlan(ctx, planId), "done"));
    expect(await blockingCourseDependents(c1)).toEqual([]);
    expect((await blockingDependents(prog1)).map((b) => b.id)).not.toContain("cur.plans");
  });
});

describe("scope (AC-10, AC-11)", () => {
  it("lets a coordinator write only their program and a head only their department's programs", async () => {
    actorId = "coord";
    expect((await newPlan(prog1)).ok).toBe(true);
    expect(await newPlan(prog2)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    actorId = "head";
    expect((await newPlan(prog1)).ok).toBe(true);
    expect(await newPlan(prog2)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    // changing a plan of another program is refused too
    actorId = "admin";
    const foreign = ok(await newPlan(prog2));
    actorId = "coord";
    expect(await add(foreign.planId, c1)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await run((ctx) => plans.approvePlan(ctx, foreign.planId))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("shows readers by scope and status: lecturer and student only approved plans", async () => {
    await user("lec", "lecturer");
    await user("stu", "student");
    await user("sec", "secretary");
    await user("nobody", "secretary");
    await db.userRole.deleteMany({ where: { userId: "nobody" } });
    const draft = ok(await newPlan(prog1));
    const approved = ok(await newPlan(prog2));
    actorId = "admin";
    ok(await add(approved.planId, c1));
    ok(await run((ctx) => plans.approvePlan(ctx, approved.planId)));

    const ids = async (u: string) =>
      (
        await db.curriculumPlan.findMany({
          where: await planWhere({ id: u }),
          select: { id: true },
        })
      )
        .map((p) => p.id)
        .sort();
    expect(await ids("admin")).toEqual([draft.planId, approved.planId].sort());
    expect(await ids("sec")).toEqual([draft.planId, approved.planId].sort());
    expect(await ids("coord")).toEqual([draft.planId]); // program 1 only
    expect(await ids("head")).toEqual([draft.planId]); // department 1 only
    expect(await ids("lec")).toEqual([approved.planId]);
    expect(await ids("stu")).toEqual([approved.planId]);
    expect(await ids("nobody")).toEqual([]);
    expect(await getPlan({ id: "lec" }, draft.planId)).toBeNull();
    expect(await getPlan({ id: "lec" }, approved.planId)).not.toBeNull();
  });
});
