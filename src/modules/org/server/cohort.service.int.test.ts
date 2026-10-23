import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/cur"; // registers the plan directory
import "@/modules/org";
import {
  blockingPlanDependents,
  registerPlanDependent,
  resetPlanDependents,
} from "./plan-dependents";
import {
  registerCohortDependent,
  registerGroupDependent,
  resetCohortDependents,
} from "./cohort-dependents";
import { programScope } from "./cohort.queries";
import * as cohorts from "./cohort.service";
import * as groups from "./group.service";

const actor = { id: "sec-1", email: "s@t.test", name: "Sec", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>, reason?: string): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "org.cohort.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let prog1: string, prog2: string, y25: string, y26: string, y27: string, closedYear: string;
let plan1: string, plan1b: string, draftPlan: string, plan2: string;

const newCohort = (over: Record<string, unknown> = {}) =>
  run((ctx) =>
    cohorts.createCohort(ctx, {
      programId: prog1,
      startAcademicYearId: y25,
      curriculumPlanId: plan1,
      name: "2025",
      ...over,
    }),
  );
const newGroup = (cohortId: string, over: Record<string, unknown> = {}) =>
  run((ctx) =>
    groups.createGroup(ctx, {
      cohortId,
      academicYearId: y26,
      yearOfStudy: 2,
      name: "G1",
      capacity: null,
      ...over,
    } as never),
  );

beforeEach(async () => {
  resetPlanDependents();
  resetCohortDependents();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "study_programs", "departments", "faculties", "academic_years", "system_settings" CASCADE',
  );
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const d = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  const mkProg = (code: string, durationYears: number) =>
    db.studyProgram
      .create({
        data: {
          departmentId: d.id,
          cycle: "FIRST",
          code,
          name: code,
          durationYears,
          totalCredits: durationYears * 60,
        },
      })
      .then((p) => p.id);
  prog1 = await mkProg("P1", 3);
  prog2 = await mkProg("P2", 1);
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
  closedYear = await mkYear("2024-2025", "2024-09-01", "CLOSED");
  y25 = await mkYear("2025-2026", "2025-09-01", "CLOSED");
  y26 = await mkYear("2026-2027", "2026-09-01", "CURRENT");
  y27 = await mkYear("2027-2028", "2027-09-01", "PLANNED");
  const mkPlan = (programId: string, version: number, status: "DRAFT" | "APPROVED") =>
    db.curriculumPlan
      .create({ data: { programId, version, validFromAcademicYearId: y25, status } })
      .then((p) => p.id);
  plan1 = await mkPlan(prog1, 1, "APPROVED");
  plan1b = await mkPlan(prog1, 2, "APPROVED");
  draftPlan = await mkPlan(prog1, 3, "DRAFT");
  plan2 = await mkPlan(prog2, 1, "APPROVED");
});

describe("cohorts (AC-1..AC-3, AC-5)", () => {
  it("creates a cohort on an approved plan of its program and audits it", async () => {
    const { cohortId } = ok(await newCohort());
    expect(await db.cohort.findUniqueOrThrow({ where: { id: cohortId } })).toMatchObject({
      name: "2025",
      active: true,
      curriculumPlanId: plan1,
    });
    expect(await db.auditLog.count({ where: { action: "org.cohort.create" } })).toBe(1);
  });

  it("refuses an unapproved or foreign plan, a duplicate name, an inactive program and unknown references", async () => {
    expect(await newCohort({ curriculumPlanId: draftPlan })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await newCohort({ curriculumPlanId: plan2 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await newCohort({ curriculumPlanId: "nope" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await newCohort({ startAcademicYearId: "nope" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    ok(await newCohort());
    expect(await newCohort()).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    ok(await newCohort({ name: "2025 evening" }));
    expect(await newCohort({ programId: "nope" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    await db.studyProgram.update({ where: { id: prog1 }, data: { active: false } });
    expect(await newCohort({ name: "x" })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("changes the plan with a reason, to another approved plan only, and not with students", async () => {
    const { cohortId } = ok(await newCohort());
    ok(await run((ctx) => cohorts.changeCohortPlan(ctx, cohortId, plan1b), "Corrected plan"));
    expect((await db.cohort.findUniqueOrThrow({ where: { id: cohortId } })).curriculumPlanId).toBe(
      plan1b,
    );
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { action: "org.cohort.change_plan" } })).reason,
    ).toBe("Corrected plan");
    expect(await run((ctx) => cohorts.changeCohortPlan(ctx, cohortId, plan1b), "x")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(
      await run((ctx) => cohorts.changeCohortPlan(ctx, cohortId, draftPlan), "x"),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    registerCohortDependent({
      id: "stu.enrollments",
      labelKey: "stu.dependents.students",
      countActive: async () => 4,
    });
    const blocked = await run((ctx) => cohorts.changeCohortPlan(ctx, cohortId, plan1), "x");
    expect(blocked).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (!blocked.ok)
      expect(blocked.error.message).toContain("HAS_DEPENDENTS:stu.dependents.students=4");
  });

  it("deactivates only without active groups in an open year or students, and reactivates", async () => {
    const { cohortId } = ok(await newCohort());
    const { groupId } = ok(await newGroup(cohortId));
    expect(await run((ctx) => cohorts.setCohortActive(ctx, cohortId, false), "x")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    ok(await run((ctx) => groups.setGroupActive(ctx, groupId, false), "x"));
    ok(await run((ctx) => cohorts.setCohortActive(ctx, cohortId, false), "Intake closed"));
    expect((await db.cohort.findUniqueOrThrow({ where: { id: cohortId } })).active).toBe(false);
    expect(await newGroup(cohortId, { name: "G2" })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    ok(await run((ctx) => cohorts.setCohortActive(ctx, cohortId, true), "Reopened"));
    expect(await run((ctx) => cohorts.setCohortActive(ctx, cohortId, true), "x")).toMatchObject({
      ok: false,
    });
  });

  it("renames a cohort and refuses a taken name", async () => {
    const a = ok(await newCohort());
    ok(await newCohort({ name: "other" }));
    expect((await run((ctx) => cohorts.renameCohort(ctx, a.cohortId, "renamed"))).ok).toBe(true);
    expect(await run((ctx) => cohorts.renameCohort(ctx, a.cohortId, "other"))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
  });
});

describe("plans and cohorts (AC-4)", () => {
  it("lets cohorts block archiving of their plan through the dependents registry", async () => {
    registerPlanDependent({
      id: "org.cohorts",
      labelKey: "org.dependents.cohorts",
      countActive: (planId) =>
        db.cohort.count({ where: { curriculumPlanId: planId, active: true } }),
    });
    expect(await blockingPlanDependents(plan1)).toEqual([]);
    const { cohortId } = ok(await newCohort());
    expect(await blockingPlanDependents(plan1)).toEqual([
      { id: "org.cohorts", labelKey: "org.dependents.cohorts", count: 1 },
    ]);
    ok(await run((ctx) => cohorts.setCohortActive(ctx, cohortId, false), "x"));
    expect(await blockingPlanDependents(plan1)).toEqual([]);
  });
});

describe("groups (AC-6..AC-8)", () => {
  it("creates groups with capacity and refuses bad placements", async () => {
    const { cohortId } = ok(await newCohort());
    ok(await newGroup(cohortId, { capacity: 30 }));
    expect(await db.studentGroup.findFirstOrThrow()).toMatchObject({
      name: "G1",
      capacity: 30,
      yearOfStudy: 2,
    });
    expect(await newGroup(cohortId)).toMatchObject({ ok: false, error: { code: "VALIDATION" } }); // name taken
    expect(await newGroup(cohortId, { name: "G2", yearOfStudy: 4 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    }); // beyond duration
    expect(await newGroup(cohortId, { name: "G3", academicYearId: closedYear })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    }); // closed + before cohort
    expect(await newGroup(cohortId, { name: "G4", academicYearId: y25 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    }); // closed year
    expect(await newGroup("nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.studentGroup.count()).toBe(1);
  });

  it("updates, deactivates with a reason and respects students", async () => {
    const { cohortId } = ok(await newCohort());
    const { groupId } = ok(await newGroup(cohortId));
    ok(await run((ctx) => groups.updateGroup(ctx, groupId, { name: "Grupi A", capacity: 25 })));
    expect(await db.studentGroup.findUniqueOrThrow({ where: { id: groupId } })).toMatchObject({
      name: "Grupi A",
      capacity: 25,
    });
    registerGroupDependent({
      id: "stu.placements",
      labelKey: "stu.dependents.students",
      countActive: async () => 12,
    });
    const blocked = await run((ctx) => groups.setGroupActive(ctx, groupId, false), "x");
    expect(blocked).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    resetCohortDependents();
    ok(await run((ctx) => groups.setGroupActive(ctx, groupId, false), "Merged"));
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { action: "org.group.deactivate" } })).reason,
    ).toBe("Merged");
    ok(await run((ctx) => groups.setGroupActive(ctx, groupId, true), "Back"));
  });
});

describe("start of year (AC-9, AC-10)", () => {
  it("previews and creates one default group per cohort and expected year, once", async () => {
    const a = ok(await newCohort({ name: "2025" })); // expected year 2 in 2026-2027
    const b = ok(await newCohort({ name: "2026", startAcademicYearId: y26 })); // year 1
    ok(await newCohort({ name: "2027", startAcademicYearId: y27 })); // not started
    const oneYear = ok(
      await run((ctx) =>
        cohorts.createCohort(ctx, {
          programId: prog2,
          startAcademicYearId: y25,
          curriculumPlanId: plan2,
          name: "short",
        }),
      ),
    ); // beyond duration
    void oneYear;

    const preview = await groups.previewStartOfYear(y26, db);
    expect(preview.map((g) => [g.cohortName, g.yearOfStudy, g.name, g.programCode])).toEqual([
      ["2025", 2, "Grupi 1", "P1"],
      ["2026", 1, "Grupi 1", "P1"],
    ]);
    expect(await db.studentGroup.count()).toBe(0); // preview writes nothing

    expect(ok(await run((ctx) => groups.startOfYear(ctx, y26)))).toEqual({ created: 2 });
    expect(await db.studentGroup.findMany({ where: { cohortId: a.cohortId } })).toHaveLength(1);
    expect(await db.studentGroup.findMany({ where: { cohortId: b.cohortId } })).toMatchObject([
      { yearOfStudy: 1 },
    ]);
    expect(await db.auditLog.count({ where: { action: "org.group.create" } })).toBe(2);
    // idempotent
    expect(ok(await run((ctx) => groups.startOfYear(ctx, y26)))).toEqual({ created: 0 });
    expect(await db.studentGroup.count()).toBe(2);
  });

  it("uses the configured default name and brings back an inactive group instead of colliding", async () => {
    await db.systemSetting.create({ data: { key: "org.defaultGroupName", value: "Grupi A" } });
    const { cohortId } = ok(await newCohort({ name: "2026", startAcademicYearId: y26 }));
    ok(await run((ctx) => groups.startOfYear(ctx, y26)));
    const g = await db.studentGroup.findFirstOrThrow({ where: { cohortId } });
    expect(g.name).toBe("Grupi A");
    ok(await run((ctx) => groups.setGroupActive(ctx, g.id, false), "x"));
    expect(ok(await run((ctx) => groups.startOfYear(ctx, y26)))).toEqual({ created: 1 });
    expect(await db.studentGroup.findMany({ where: { cohortId } })).toMatchObject([
      { active: true },
    ]);
  });

  it("refuses a closed or unknown year", async () => {
    expect(await run((ctx) => groups.startOfYear(ctx, y25))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await run((ctx) => groups.startOfYear(ctx, "nope"))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("scope (AC-11)", () => {
  it("limits a program-scoped reader to their program", async () => {
    await db.user.deleteMany();
    await db.user.create({ data: { id: "coord", email: "c@t.test", name: "c" } });
    await db.userRole.create({
      data: { userId: "coord", role: "program_coordinator", scopeType: "PROGRAM", scopeId: prog1 },
    });
    await db.user.create({ data: { id: "sec", email: "s@t.test", name: "s" } });
    await db.userRole.create({
      data: { userId: "sec", role: "secretary", scopeType: "INSTITUTION" },
    });
    ok(await newCohort());
    ok(
      await run((ctx) =>
        cohorts.createCohort(ctx, {
          programId: prog2,
          startAcademicYearId: y25,
          curriculumPlanId: plan2,
          name: "other",
        }),
      ),
    );
    const names = async (u: string) =>
      (
        await db.cohort.findMany({
          where: { program: await programScope({ id: u }, "org.cohort.read") },
          select: { name: true },
        })
      )
        .map((c) => c.name)
        .sort();
    expect(await names("sec")).toEqual(["2025", "other"]);
    expect(await names("coord")).toEqual(["2025"]);
  });
});
