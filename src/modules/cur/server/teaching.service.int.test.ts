import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/hr";
import "@/modules/cur";
import { board, ownAssignments, teachingProgramScope } from "./teaching.queries";
import * as svc from "./teaching.service";

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
    permission: "cur.teaching.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let dep1: string, dep2: string, prog1: string, prog2: string;
let y25: string, y26: string, closedYear: string;
let plan1: string, plan2: string, pcA: string, pcY2: string, pcP2: string;
let group1: string, group2: string, cohort1: string;
let lecturer: string, lecturer2: string, admin: string, inactive: string;

const person = (n: string) =>
  db.person.create({
    data: {
      firstName: n,
      lastName: "L",
      gender: "MALE",
      birthDate: new Date("1980-01-01T00:00:00Z"),
      email: `${n}@t.test`,
    },
  });
async function staff(name: string, over: Record<string, unknown> = {}) {
  const p = await person(name);
  return db.staff
    .create({
      data: {
        personId: p.id,
        kind: "ACADEMIC",
        category: "PAE",
        contractStart: new Date("2020-09-01T00:00:00Z"),
        ...over,
      },
    })
    .then((s) => s.id);
}
async function user(
  id: string,
  role: "sysadmin" | "head_of_department" | "lecturer" | "secretary",
  scope?: { type: "DEPARTMENT"; id: string },
  personId?: string,
) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id, personId } });
  await db.userRole.create({
    data: { userId: id, role, scopeType: scope?.type ?? "INSTITUTION", scopeId: scope?.id ?? null },
  });
}
const assign = (over: Record<string, unknown> = {}) =>
  run((ctx) =>
    svc.createAssignment(ctx, {
      groupId: group1,
      planCourseId: pcA,
      staffId: lecturer,
      kind: "LECTURE",
      ...over,
    } as never),
  );

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "teaching_assignments", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "staff", "user_roles", "study_programs", "departments", "faculties", "academic_years", "system_settings" CASCADE',
  );
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
          name: code,
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
          startDate: new Date(`${start}T00:00:00Z`),
          endDate: new Date(`${Number(start.slice(0, 4)) + 1}-08-31T00:00:00Z`),
          status,
        },
      })
      .then((y) => y.id);
  closedYear = await mkYear("2024-2025", "2024-09-01", "CLOSED");
  y25 = await mkYear("2025-2026", "2025-09-01", "CURRENT");
  y26 = await mkYear("2026-2027", "2026-09-01", "CURRENT").catch(
    async () =>
      (
        await db.academicYear.create({
          data: {
            code: "2026-2027",
            startDate: new Date("2026-09-01T00:00:00Z"),
            endDate: new Date("2027-08-31T00:00:00Z"),
            status: "PLANNED",
          },
        })
      ).id,
  );
  const mkCourse = (code: string, over: Record<string, unknown> = {}) =>
    db.course
      .create({
        data: {
          code,
          name: code,
          defaultCredits: 6,
          hoursLecture: 30,
          hoursSeminar: 15,
          hoursLab: 10,
          departmentId: dep1,
          ...over,
        },
      })
      .then((c) => c.id);
  const cA = await mkCourse("CA");
  const cB = await mkCourse("CB");
  const cY2 = await mkCourse("CY2");
  const cP2 = await mkCourse("CP2", { departmentId: dep2 });
  const mkPlan = (programId: string) =>
    db.curriculumPlan
      .create({ data: { programId, version: 1, validFromAcademicYearId: y25, status: "DRAFT" } })
      .then((p) => p.id);
  plan1 = await mkPlan(prog1);
  plan2 = await mkPlan(prog2);
  const mkPc = (planId: string, courseId: string, yearOfStudy: number, semester: number) =>
    db.planCourse
      .create({
        data: {
          planId,
          courseId,
          yearOfStudy,
          semester,
          credits: 6,
          hoursLecture: 30,
          hoursSeminar: 15,
          hoursLab: 10,
        },
      })
      .then((p) => p.id);
  pcA = await mkPc(plan1, cA, 1, 1);
  await mkPc(plan1, cB, 1, 2);
  pcY2 = await mkPc(plan1, cY2, 2, 1);
  pcP2 = await mkPc(plan2, cP2, 1, 1);
  await db.curriculumPlan.updateMany({ data: { status: "APPROVED" } });
  cohort1 = (
    await db.cohort.create({
      data: { programId: prog1, startAcademicYearId: y25, curriculumPlanId: plan1, name: "2025" },
    })
  ).id;
  const cohort2 = (
    await db.cohort.create({
      data: { programId: prog2, startAcademicYearId: y25, curriculumPlanId: plan2, name: "2025" },
    })
  ).id;
  group1 = (
    await db.studentGroup.create({
      data: { cohortId: cohort1, academicYearId: y25, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  group2 = (
    await db.studentGroup.create({
      data: { cohortId: cohort2, academicYearId: y25, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  lecturer = await staff("lec1");
  lecturer2 = await staff("lec2", { category: "PAK" });
  admin = await staff("adm", { kind: "ADMINISTRATIVE" });
  inactive = await staff("old", { active: false });
  await user("admin", "sysadmin");
  await user("head1", "head_of_department", { type: "DEPARTMENT", id: dep1 });
  actorId = "admin";
});

describe("createAssignment (AC-1..AC-3)", () => {
  it("assigns a lecturer with the plan course's hours by default and audits", async () => {
    const { assignmentId } = ok(await assign());
    expect(
      await db.teachingAssignment.findUniqueOrThrow({ where: { id: assignmentId } }),
    ).toMatchObject({ kind: "LECTURE", plannedHours: 30, semester: 1, staffId: lecturer });
    ok(await assign({ kind: "LAB" }));
    ok(await assign({ kind: "SEMINAR", plannedHours: 20, staffId: lecturer2 }));
    const hours = (await db.teachingAssignment.findMany({ orderBy: { kind: "asc" } })).map((a) => [
      a.kind,
      a.plannedHours,
    ]);
    expect(hours).toEqual([
      ["LECTURE", 30],
      ["SEMINAR", 20],
      ["LAB", 10],
    ]);
    expect(await db.auditLog.count({ where: { action: "cur.teaching.create" } })).toBe(3);
  });

  it("refuses wrong courses, lecturers, groups and repeats", async () => {
    ok(await assign());
    expect(await assign()).toMatchObject({ ok: false, error: { code: "VALIDATION" } }); // same lecturer, kind, course
    expect(await assign({ planCourseId: pcY2 })).toMatchObject({ ok: false }); // other year of study
    expect(await assign({ planCourseId: pcP2 })).toMatchObject({ ok: false }); // course of another plan
    expect(await assign({ staffId: admin })).toMatchObject({ ok: false });
    expect(await assign({ staffId: inactive })).toMatchObject({ ok: false });
    expect(await assign({ staffId: "nope" })).toMatchObject({ ok: false });
    expect(await assign({ plannedHours: 501 })).toMatchObject({ ok: false });
    await db.studentGroup.update({ where: { id: group1 }, data: { active: false } });
    expect(await assign({ staffId: lecturer2 })).toMatchObject({ ok: false });
    expect(
      await run((ctx) =>
        svc.createAssignment(ctx, {
          groupId: "nope",
          planCourseId: pcA,
          staffId: lecturer,
          kind: "LECTURE",
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.teachingAssignment.count()).toBe(1);
  });

  it("refuses a group of a closed year", async () => {
    await db.academicYear.update({ where: { id: y25 }, data: { status: "CLOSED" } });
    expect(await assign({ staffId: lecturer2 })).toMatchObject({ ok: false });
  });
});

describe("update and remove (AC-4)", () => {
  it("changes the lecturer and hours and removes, with audit", async () => {
    const { assignmentId } = ok(await assign());
    ok(
      await run((ctx) =>
        svc.updateAssignment(ctx, assignmentId, { staffId: lecturer2, plannedHours: 25 }),
      ),
    );
    expect(
      await db.teachingAssignment.findUniqueOrThrow({ where: { id: assignmentId } }),
    ).toMatchObject({ staffId: lecturer2, plannedHours: 25 });
    expect(
      await run((ctx) =>
        svc.updateAssignment(ctx, assignmentId, { staffId: admin, plannedHours: 25 }),
      ),
    ).toMatchObject({ ok: false });
    ok(
      await run((ctx) =>
        svc.updateAssignment(ctx, assignmentId, { staffId: lecturer2, plannedHours: 10 }),
      ),
    );
    ok(await run((ctx) => svc.removeAssignment(ctx, assignmentId)));
    expect(await db.teachingAssignment.count()).toBe(0);
    expect(
      await db.auditLog.count({
        where: { action: { in: ["cur.teaching.update", "cur.teaching.remove"] } },
      }),
    ).toBe(3);
    expect(await run((ctx) => svc.removeAssignment(ctx, assignmentId))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("refuses changes once the year is closed", async () => {
    const { assignmentId } = ok(await assign());
    await db.academicYear.update({ where: { id: y25 }, data: { status: "CLOSED" } });
    expect(
      await run((ctx) =>
        svc.updateAssignment(ctx, assignmentId, { staffId: lecturer2, plannedHours: 1 }),
      ),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await run((ctx) => svc.removeAssignment(ctx, assignmentId))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });
});

describe("scope (AC-9)", () => {
  it("lets a head of department assign only in their department's programs", async () => {
    actorId = "head1";
    expect((await assign()).ok).toBe(true);
    expect(
      await run((ctx) =>
        svc.createAssignment(ctx, {
          groupId: group2,
          planCourseId: pcP2,
          staffId: lecturer,
          kind: "LECTURE",
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    actorId = "admin";
    const foreign = ok(
      await run((ctx) =>
        svc.createAssignment(ctx, {
          groupId: group2,
          planCourseId: pcP2,
          staffId: lecturer,
          kind: "LECTURE",
        }),
      ),
    );
    actorId = "head1";
    expect(await run((ctx) => svc.removeAssignment(ctx, foreign.assignmentId))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("limits readers by program", async () => {
    await user("sec", "secretary");
    const names = async (u: string) =>
      (
        await db.studyProgram.findMany({
          where: await teachingProgramScope({ id: u }, "cur.teaching.read"),
          select: { code: true },
        })
      )
        .map((p) => p.code)
        .sort();
    expect(await names("sec")).toEqual(["P1", "P2"]);
    expect(await names("head1")).toEqual(["P1"]);
  });
});

describe("board and warnings (AC-6)", () => {
  it("lists groups with plan courses and assignments, unassigned courses and overloaded lecturers", async () => {
    ok(await assign());
    ok(await assign({ kind: "SEMINAR", staffId: lecturer2, plannedHours: 400 }));
    const b = await board({ id: "admin" }, { yearId: y25 });
    const g1 = b.groups.find((g) => g.id === group1)!;
    expect(g1.courses.map((c) => [c.code, c.assignments.length])).toEqual([
      ["CA", 2],
      ["CB", 0],
    ]);
    expect(b.unassigned.map((u) => u.course)).toEqual(
      expect.arrayContaining(["CB — CB", "CP2 — CP2"]),
    );
    expect(b.unassigned.some((u) => u.course.startsWith("CA"))).toBe(false);
    expect(b.overloaded).toEqual([]); // off by default

    await db.systemSetting.create({ data: { key: "cur.teaching.maxPlannedHours", value: 300 } });
    const limited = await board({ id: "admin" }, { yearId: y25 });
    expect(limited.overloaded).toMatchObject([{ staffId: lecturer2, hours: 400 }]);

    const sem2 = await board({ id: "admin" }, { yearId: y25, semester: 2, programCode: "P1" });
    expect(sem2.groups.map((g) => g.courses.map((c) => c.code))).toEqual([["CB"]]);
  });
});

describe("copyAssignments (AC-5)", () => {
  it("copies by group name, program, year of study, course, kind and lecturer, once", async () => {
    ok(await assign());
    ok(await assign({ kind: "LAB", plannedHours: 12 }));
    ok(await assign({ staffId: lecturer2, kind: "SEMINAR" }));
    const g26 = (
      await db.studentGroup.create({
        data: { cohortId: cohort1, academicYearId: y26, yearOfStudy: 1, name: "G1" },
      })
    ).id;
    const r = ok(await run((ctx) => svc.copyAssignments(ctx, y25, y26)));
    expect(r).toMatchObject({ copied: 3, skippedExisting: 0, skippedInactive: 0 });
    const rows = await db.teachingAssignment.findMany({
      where: { groupId: g26 },
      orderBy: { kind: "asc" },
    });
    expect(rows.map((x) => [x.kind, x.plannedHours, x.semester])).toEqual([
      ["LECTURE", 30, 1],
      ["SEMINAR", 15, 1],
      ["LAB", 12, 1],
    ]);
    expect(await db.auditLog.count({ where: { action: "cur.teaching.copy" } })).toBe(1);
    // running again copies nothing
    expect(ok(await run((ctx) => svc.copyAssignments(ctx, y25, y26)))).toMatchObject({
      copied: 0,
      skippedExisting: 3,
    });
  });

  it("skips inactive lecturers and refuses a closed or equal target", async () => {
    ok(await assign());
    await db.staff.update({ where: { id: lecturer }, data: { active: false } });
    await db.studentGroup.create({
      data: { cohortId: cohort1, academicYearId: y26, yearOfStudy: 1, name: "G1" },
    });
    expect(ok(await run((ctx) => svc.copyAssignments(ctx, y25, y26)))).toMatchObject({
      copied: 0,
      skippedInactive: 1,
    });
    expect(await run((ctx) => svc.copyAssignments(ctx, y25, y25))).toMatchObject({ ok: false });
    expect(await run((ctx) => svc.copyAssignments(ctx, y25, closedYear))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("only copies into groups the user may write", async () => {
    ok(await assign());
    actorId = "admin";
    ok(
      await run((ctx) =>
        svc.createAssignment(ctx, {
          groupId: group2,
          planCourseId: pcP2,
          staffId: lecturer,
          kind: "LECTURE",
        }),
      ),
    );
    const cohort2 = (await db.cohort.findFirstOrThrow({ where: { programId: prog2 } })).id;
    await db.studentGroup.create({
      data: { cohortId: cohort1, academicYearId: y26, yearOfStudy: 1, name: "G1" },
    });
    await db.studentGroup.create({
      data: { cohortId: cohort2, academicYearId: y26, yearOfStudy: 1, name: "G1" },
    });
    actorId = "head1";
    expect(ok(await run((ctx) => svc.copyAssignments(ctx, y25, y26)))).toMatchObject({ copied: 1 });
  });
});

describe("own assignments (AC-8)", () => {
  it("shows a lecturer only their own assignments", async () => {
    ok(await assign());
    ok(await assign({ staffId: lecturer2, kind: "SEMINAR" }));
    const personId = (await db.staff.findUniqueOrThrow({ where: { id: lecturer } })).personId;
    await user("me", "lecturer", undefined, personId);
    await user("nobody", "lecturer");
    expect(await ownAssignments({ id: "me" }, y25)).toMatchObject([
      { kind: "LECTURE", plannedHours: 30, course: "CA — CA" },
    ]);
    expect(await ownAssignments({ id: "nobody" }, y25)).toBeNull();
    expect(await ownAssignments({ id: "me" }, y26)).toEqual([]);
  });
});
