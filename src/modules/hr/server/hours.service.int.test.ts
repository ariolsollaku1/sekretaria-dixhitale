import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/att";
import { addDays, todayInTirane } from "@/modules/att";
import "../permissions";
import "./staff-resolver";
import { monthOf } from "../domain/hours-rules";
import {
  courseRows,
  getMonthDetail,
  getOwnHours,
  monthRows,
  totalsByCategory,
} from "./hours.queries";
import * as svc from "./hours.service";

let actorId = "head1";
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
    permission: "hr.hours.approve",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const code = (r: ActionResult<unknown>) => (r.ok ? "OK" : `${r.error.code}:${r.error.message}`);

const today = todayInTirane();
const d = (s: string) => new Date(`${s}T00:00:00Z`);
// a month that has surely ended, the month before it, and the running month
const PAST = monthOf(addDays(today, -35));
const THIS = monthOf(today);
const PAST_DAY = (n: number) => `${PAST}-${String(n).padStart(2, "0")}`;

let yearId: string;
let aA: string, aA2: string, aB: string, aClosed: string;
let staffA: string, staffB: string;

async function person(n: string) {
  return db.person.create({
    data: {
      firstName: n,
      lastName: "L",
      gender: "MALE",
      birthDate: d("1990-01-01"),
      email: `${n}@t.test`,
    },
  });
}
async function user(id: string, role: string, personId?: string, scope?: [string, string]) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id, personId } });
  await db.userRole.create({
    data: {
      userId: id,
      role: role as never,
      scopeType: (scope?.[0] as never) ?? "INSTITUTION",
      scopeId: scope?.[1] ?? null,
    },
  });
}
const held = (assignmentId: string, date: string, hours: number, startMinute = 480) =>
  db.classSession.create({
    data: {
      assignmentId,
      date: d(date),
      startMinute,
      endMinute: startMinute + 90,
      hours,
      status: "HELD",
    },
  });

const approve = (staffId: string, month = PAST) =>
  run((ctx) => svc.approveMonth(ctx, { staffId, month }));
const adjust = (over: Record<string, unknown> = {}) =>
  run((ctx) =>
    svc.addAdjustment(ctx, {
      staffId: staffA,
      assignmentId: aA,
      month: PAST,
      hours: 2,
      reason: "Replaced a colleague",
      ...over,
    } as never),
  );

beforeEach(async () => {
  actorId = "head1";
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "hours_adjustments", "hours_approvals", "class_sessions", "teaching_assignments", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "staff", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep1 = (await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } }))
    .id;
  const dep2 = (await db.department.create({ data: { code: "D2", name: "D2", facultyId: f.id } }))
    .id;
  const prog = (
    await db.studyProgram.create({
      data: {
        departmentId: dep1,
        cycle: "FIRST",
        code: "P1",
        name: "P1",
        durationYears: 3,
        totalCredits: 180,
      },
    })
  ).id;
  const closedYear = (
    await db.academicYear.create({
      data: {
        code: "2020-2021",
        startDate: d("2020-09-01"),
        endDate: d("2021-08-31"),
        status: "CLOSED",
      },
    })
  ).id;
  yearId = (
    await db.academicYear.create({
      data: {
        code: "CUR",
        startDate: d(addDays(today, -200)),
        endDate: d(addDays(today, 250)),
        status: "CURRENT",
      },
    })
  ).id;
  const plan = (
    await db.curriculumPlan.create({
      data: { programId: prog, version: 1, validFromAcademicYearId: yearId, status: "DRAFT" },
    })
  ).id;
  const mkCourse = async (code: string, semester: number) => {
    const c = await db.course.create({
      data: { code, name: `Course ${code}`, defaultCredits: 6, departmentId: dep1 },
    });
    return (
      await db.planCourse.create({
        data: { planId: plan, courseId: c.id, yearOfStudy: 1, semester, credits: 6 },
      })
    ).id;
  };
  const pc1 = await mkCourse("C1", 1);
  const pc2 = await mkCourse("C2", 2);
  await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
  const mkCohort = async (startYear: string, name: string) =>
    (
      await db.cohort.create({
        data: { programId: prog, startAcademicYearId: startYear, curriculumPlanId: plan, name },
      })
    ).id;
  const cohort = await mkCohort(yearId, "C");
  const oldCohort = await mkCohort(closedYear, "OLD");
  const mkGroup = async (cohortId: string, academicYearId: string, name: string) =>
    (
      await db.studentGroup.create({
        data: { cohortId, academicYearId, yearOfStudy: 1, name },
      })
    ).id;
  const g1 = await mkGroup(cohort, yearId, "G1");
  const oldGroup = await mkGroup(oldCohort, closedYear, "G1");

  const staffOf = async (n: string, department: string, category: "PAE" | "PAK") => {
    const p = await person(n);
    const st = await db.staff.create({
      data: {
        personId: p.id,
        kind: "ACADEMIC",
        category,
        departmentId: department,
        contractStart: d("2020-01-01"),
      },
    });
    return st.id;
  };
  staffA = await staffOf("lecA", dep1, "PAE");
  staffB = await staffOf("lecB", dep2, "PAK");
  const asg = async (groupId: string, planCourseId: string, staffId: string, semester: number) =>
    (
      await db.teachingAssignment.create({
        data: { groupId, planCourseId, staffId, kind: "LECTURE", semester, plannedHours: 30 },
      })
    ).id;
  aA = await asg(g1, pc1, staffA, 1);
  aA2 = await asg(g1, pc2, staffA, 2);
  aB = await asg(g1, pc1, staffB, 1);
  aClosed = await asg(oldGroup, pc1, staffA, 1);

  await user("head1", "head_of_department", undefined, ["DEPARTMENT", dep1]);
  await user("hr1", "hr");
  await user("fin1", "finance");
  await user("student1", "student", undefined, ["SELF", ""]);

  // lecA: 2h + 3h held and one planned class not recorded in the past month, 1h in the running month
  await held(aA, PAST_DAY(5), 2);
  await held(aA, PAST_DAY(12), 3);
  await db.classSession.create({
    data: {
      assignmentId: aA,
      date: d(PAST_DAY(19)),
      startMinute: 480,
      endMinute: 570,
      hours: 2,
      status: "PLANNED",
    },
  });
  await held(aA2, PAST_DAY(6), 1, 600);
  // lecB: 4h in the past month
  await held(aB, PAST_DAY(7), 4);
  // a cancelled class counts for nothing
  await db.classSession.create({
    data: {
      assignmentId: aB,
      date: d(PAST_DAY(8)),
      startMinute: 480,
      endMinute: 570,
      hours: 9,
      status: "CANCELLED",
    },
  });
  if (THIS !== PAST) await held(aA, `${THIS}-01`, 1);
});

describe("reading (AC-1, AC-3, AC-4, AC-11)", () => {
  const base = () => ({ yearId });

  it("counts held hours per lecturer and month with the unrecorded planned class", async () => {
    const rows = await monthRows({ id: "hr1" }, base());
    const a = rows.find((r) => r.staffId === staffA && r.month === PAST)!;
    expect(a).toMatchObject({
      sessions: 3,
      heldHours: 6,
      adjustmentHours: 0,
      total: 6,
      pending: 1,
    });
    expect(a.state).toBe("PENDING");
    const b = rows.find((r) => r.staffId === staffB && r.month === PAST)!;
    expect(b).toMatchObject({ sessions: 1, heldHours: 4, total: 4, pending: 0 });
  });

  it("limits a head of department to their department; HR and Finance see all", async () => {
    const head = await monthRows({ id: "head1" }, base());
    expect(new Set(head.map((r) => r.staffId))).toEqual(new Set([staffA]));
    for (const id of ["hr1", "fin1"]) {
      const all = await monthRows({ id }, base());
      expect(new Set(all.map((r) => r.staffId))).toEqual(new Set([staffA, staffB]));
    }
  });

  it("gives nothing to users without the read permission", async () => {
    expect(await monthRows({ id: "student1" }, base())).toEqual([]);
    expect(await courseRows({ id: "student1" }, base())).toEqual([]);
    expect(await getMonthDetail({ id: "student1" }, staffA, PAST, yearId)).toBeNull();
  });

  it("filters the course report and totals PAE against PAK", async () => {
    const rows = await courseRows({ id: "hr1" }, { ...base(), month: PAST });
    expect(rows).toHaveLength(3);
    expect(totalsByCategory(rows)).toEqual({ PAE: 6, PAK: 4, VOLUNTEER: 0 });
    const sem2 = await courseRows({ id: "hr1" }, { ...base(), month: PAST, semester: "2" });
    expect(sem2.map((r) => [r.courseCode, r.total])).toEqual([["C2", 1]]);
    const pak = await courseRows({ id: "hr1" }, { ...base(), category: "PAK" });
    expect(pak.every((r) => r.category === "PAK")).toBe(true);
    const course = await courseRows({ id: "hr1" }, { ...base(), course: "c2" });
    expect(course.map((r) => r.courseCode)).toEqual(["C2"]);
  });

  it("hides a lecturer outside the head's scope from the detail page", async () => {
    expect(await getMonthDetail({ id: "head1" }, staffB, PAST, yearId)).toBeNull();
    const own = await getMonthDetail({ id: "head1" }, staffA, PAST, yearId);
    expect(own).toMatchObject({ state: "PENDING", can: { approve: true, adjust: true } });
    expect(own!.sessions.map((s) => s.status)).toContain("PLANNED");
    const hr = await getMonthDetail({ id: "hr1" }, staffA, PAST, yearId);
    expect(hr!.can).toEqual({ approve: false, adjust: true });
  });

  it("shows a lecturer only their own months (AC-2)", async () => {
    const lecA = (await db.staff.findUniqueOrThrow({ where: { id: staffA } })).personId;
    await db.user.create({
      data: { id: "lecA-acc", email: "lecA-acc@t.test", name: "a", personId: lecA },
    });
    const own = await getOwnHours("lecA-acc", yearId);
    expect(own!.staff.id).toBe(staffA);
    expect(own!.months.map((m) => m.month)).toContain(PAST);
    expect(own!.months.every((m) => m.staffId === staffA)).toBe(true);
    expect(own!.selected?.sessions.every((s) => s.staffId === staffA)).toBe(true);
    expect(await getOwnHours("student1", yearId)).toBeNull();
  });
});

describe("approval (AC-6..AC-8)", () => {
  it("approves an ended month, stores the figures and audits it", async () => {
    ok(await approve(staffA));
    const row = await db.hoursApproval.findFirstOrThrow({ where: { staffId: staffA } });
    expect(row).toMatchObject({ status: "APPROVED", heldHours: 6, adjustmentHours: 0 });
    expect(row.decidedById).toBe("head1");
    const rows = await monthRows({ id: "hr1" }, { yearId });
    expect(rows.find((r) => r.staffId === staffA && r.month === PAST)!.state).toBe("APPROVED");
    expect(await db.auditLog.count({ where: { action: "hr.hours.approve" } })).toBe(1);
  });

  it("refuses a foreign department, a running month, an empty month and a repeat", async () => {
    expect(code(await approve(staffB))).toMatch(/^FORBIDDEN/);
    if (THIS !== PAST) expect(code(await approve(staffA, THIS))).toBe("CONFLICT:NOT_ENDED");
    expect(code(await approve(staffA, monthOf(addDays(today, -100))))).toBe("CONFLICT:EMPTY");
    ok(await approve(staffA));
    expect(code(await approve(staffA))).toBe("CONFLICT:ALREADY_APPROVED");
    // HR may adjust but not approve
    actorId = "hr1";
    expect((await approve(staffB)).ok).toBe(false);
  });

  it("marks a month changed when a class is added later and needs a new approval", async () => {
    ok(await approve(staffA));
    await held(aA, PAST_DAY(20), 2);
    const detail = await getMonthDetail({ id: "head1" }, staffA, PAST, yearId);
    expect(detail!.state).toBe("CHANGED");
    ok(await approve(staffA));
    expect((await getMonthDetail({ id: "head1" }, staffA, PAST, yearId))!.state).toBe("APPROVED");
    expect(await db.hoursApproval.count({ where: { staffId: staffA } })).toBe(1);
  });

  it("reopens an approved month with a reason and keeps the row", async () => {
    expect(
      code(
        await run((ctx) => svc.reopenMonth(ctx, { staffId: staffA, month: PAST, reason: "Typo" })),
      ),
    ).toBe("CONFLICT:NOT_APPROVED");
    ok(await approve(staffA));
    ok(await run((ctx) => svc.reopenMonth(ctx, { staffId: staffA, month: PAST, reason: "Typo" })));
    const row = await db.hoursApproval.findFirstOrThrow({ where: { staffId: staffA } });
    expect(row.status).toBe("OPEN");
    expect((await getMonthDetail({ id: "head1" }, staffA, PAST, yearId))!.state).toBe("OPEN");
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "hr.hours.reopen" } });
    expect(JSON.stringify(audit.after)).toContain("Typo");
  });
});

describe("adjustments (AC-9, AC-10)", () => {
  it("adds hours with a reason to the month's total and audits it", async () => {
    ok(await adjust({ hours: -1 }));
    ok(await adjust({ hours: 3, assignmentId: aA2 }));
    const d1 = await getMonthDetail({ id: "head1" }, staffA, PAST, yearId);
    expect(d1!.totals).toMatchObject({ heldHours: 6, adjustmentHours: 2, total: 8 });
    expect(d1!.adjustments).toHaveLength(2);
    expect(await db.auditLog.count({ where: { action: "hr.hours.adjust" } })).toBe(2);
  });

  it("lets HR adjust any lecturer but the head only their department", async () => {
    expect(code(await adjust({ staffId: staffB, assignmentId: aB }))).toMatch(/^FORBIDDEN/);
    actorId = "hr1";
    ok(await adjust({ staffId: staffB, assignmentId: aB }));
  });

  it("refuses another lecturer's assignment, a month outside the year and a closed year", async () => {
    expect(code(await adjust({ assignmentId: aB }))).toBe("NOT_FOUND:Assignment not found");
    expect(code(await adjust({ month: monthOf(addDays(today, -400)) }))).toBe(
      "VALIDATION:MONTH_OUTSIDE_YEAR",
    );
    expect(code(await adjust({ assignmentId: aClosed, month: "2021-03" }))).toBe(
      "CONFLICT:YEAR_CLOSED",
    );
  });

  it("refuses while the month is approved and accepts after a reopen; rows are never removed", async () => {
    ok(await adjust());
    ok(await approve(staffA));
    expect(code(await adjust())).toBe("CONFLICT:APPROVED");
    ok(await run((ctx) => svc.reopenMonth(ctx, { staffId: staffA, month: PAST, reason: "Fix" })));
    ok(await adjust({ hours: -2, reason: "Opposite correction" }));
    expect(await db.hoursAdjustment.count({ where: { staffId: staffA } })).toBe(2);
    expect(
      (await getMonthDetail({ id: "head1" }, staffA, PAST, yearId))!.totals.adjustmentHours,
    ).toBe(0);
  });
});
