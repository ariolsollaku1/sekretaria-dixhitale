import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "../permissions";
import { feeItemSchema, type FeeItemInput } from "../domain/schemas";
import { feeBoard } from "./fee.queries";
import * as fees from "./fee.service";
import { getPlan } from "./plan.queries";
import * as plans from "./plan.service";

let actorId = "fin";
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
    permission: "fin.fee.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const code = (r: ActionResult<unknown>) => (r.ok ? "OK" : `${r.error.code}:${r.error.message}`);
const fields = (r: ActionResult<unknown>) => (r.ok ? {} : (r.error.fieldErrors ?? {}));

let yearId: string, closedYearId: string, progId: string, prog2Id: string;
let en1: string, en2: string, enSusp: string, enGone: string, enNoReg: string;

const person = (n: string) =>
  db.person.create({
    data: {
      firstName: n,
      lastName: "L",
      gender: "MALE",
      birthDate: new Date("1990-01-01T00:00:00Z"),
      email: `${n}@t.test`,
    },
  });
async function user(id: string, role: string) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: { userId: id, role: role as never, scopeType: "INSTITUTION", scopeId: null },
  });
}

const item = (over: Record<string, unknown> = {}): FeeItemInput =>
  feeItemSchema.parse({
    programId: progId,
    academicYearId: yearId,
    kind: "TUITION",
    amount: "1000.00",
    installments: [
      { dueDate: "2026-10-01", amount: "600.00" },
      { dueDate: "2027-02-01", amount: "400.00" },
    ],
    discounts: [
      {
        label: "early",
        kind: "PERCENT",
        value: "10",
        validFrom: "2026-08-01",
        validTo: "2026-09-15",
      },
    ],
    ...over,
  });
const save = (over: Record<string, unknown> = {}) =>
  run((ctx) => fees.saveFeeItem(ctx, item(over)));
const generate = (over: Record<string, unknown> = {}) =>
  run((ctx) =>
    plans.generatePlans(ctx, {
      academicYearId: yearId,
      programId: progId,
      studentNumber: null,
      ...over,
    }),
  );

beforeEach(async () => {
  actorId = "fin";
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "plan_installments", "payment_plans", "fee_discounts", "fee_installment_templates", "fee_schedule_items", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } });
  const mkProg = (code: string) =>
    db.studyProgram
      .create({
        data: {
          departmentId: dep.id,
          cycle: "FIRST",
          code,
          name: code,
          durationYears: 3,
          totalCredits: 180,
        },
      })
      .then((p) => p.id);
  progId = await mkProg("P1");
  prog2Id = await mkProg("P2");
  closedYearId = (
    await db.academicYear.create({
      data: {
        code: "2020-2021",
        startDate: new Date("2020-09-01T00:00:00Z"),
        endDate: new Date("2021-08-31T00:00:00Z"),
        status: "CLOSED",
      },
    })
  ).id;
  yearId = (
    await db.academicYear.create({
      data: {
        code: "2026-2027",
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2027-08-31T00:00:00Z"),
        status: "CURRENT",
      },
    })
  ).id;
  const plan = (
    await db.curriculumPlan.create({
      data: { programId: progId, version: 1, validFromAcademicYearId: yearId, status: "DRAFT" },
    })
  ).id;
  const course = await db.course.create({
    data: { code: "CA", name: "CA", defaultCredits: 6, departmentId: dep.id },
  });
  await db.planCourse.create({
    data: { planId: plan, courseId: course.id, yearOfStudy: 1, semester: 1, credits: 6 },
  });
  await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
  const cohort = (
    await db.cohort.create({
      data: {
        programId: progId,
        startAcademicYearId: yearId,
        curriculumPlanId: plan,
        name: "C",
      },
    })
  ).id;
  const group = (
    await db.studentGroup.create({
      data: { cohortId: cohort, academicYearId: yearId, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  const enroll = async (
    n: string,
    status: "ACTIVE" | "SUSPENDED" | "DEREGISTERED",
    registered = true,
  ) => {
    const p = await person(n);
    const st = await db.student.create({ data: { personId: p.id } });
    const en = await db.enrollment.create({
      data: {
        studentId: st.id,
        programId: progId,
        cohortId: cohort,
        registrationType: "FIRST_TIME",
        status,
        startedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    if (registered)
      await db.yearRegistration.create({
        data: { enrollmentId: en.id, academicYearId: yearId, yearOfStudy: 1, groupId: group },
      });
    return en.id;
  };
  en1 = await enroll("s1", "ACTIVE");
  en2 = await enroll("s2", "ACTIVE");
  enSusp = await enroll("s3", "SUSPENDED");
  enGone = await enroll("s4", "DEREGISTERED");
  enNoReg = await enroll("s5", "ACTIVE", false);
  await user("fin", "finance");
  await user("sec", "secretary");
  await user("lec", "lecturer");
  await user("stu", "student");
});

describe("saveFeeItem (AC-1..AC-5)", () => {
  it("creates a fee with installments and discounts and audits it", async () => {
    const { itemId } = ok(await save());
    const row = await db.feeScheduleItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { installments: true, discounts: true },
    });
    expect(row.amount.toFixed(2)).toBe("1000.00");
    expect(row.installments.map((i) => i.sequence)).toEqual([1, 2]);
    expect(row.discounts[0]?.value.toFixed(2)).toBe("10.00");
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "fin.fee.create" } });
    expect(audit.entityId).toBe(itemId);
  });

  it("refuses a duplicate key, but allows another label", async () => {
    ok(await save());
    expect(fields(await save()).label).toEqual(["duplicate"]);
    ok(await save({ label: "second" }));
  });

  it("refuses installments that do not add up and bad discounts", async () => {
    expect(
      fields(await save({ installments: [{ dueDate: "2026-10-01", amount: "999.99" }] }))
        .installments,
    ).toEqual(["sumMismatch"]);
    expect(
      fields(
        await save({
          discounts: [
            { kind: "PERCENT", value: "10", validFrom: "2026-10-01", validTo: "2026-09-01" },
          ],
        }),
      ).discounts,
    ).toEqual(["reversed"]);
    expect(fields(await save({ amount: "0" })).amount).toEqual(["range"]);
  });

  it("replaces installments and discounts on update, with before and after in the audit", async () => {
    const { itemId } = ok(await save());
    ok(
      await run((ctx) =>
        fees.saveFeeItem(
          ctx,
          item({
            itemId,
            amount: "500",
            installments: [],
            discounts: [],
          }),
        ),
      ),
    );
    const row = await db.feeScheduleItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { installments: true, discounts: true },
    });
    expect(row.amount.toFixed(2)).toBe("500.00");
    expect(row.installments).toHaveLength(0);
    expect(row.discounts).toHaveLength(0);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "fin.fee.update" } });
    expect(JSON.stringify(audit.before)).toContain("1000.00");
    expect(JSON.stringify(audit.after)).toContain("500.00");
  });

  it("deactivates and reactivates instead of deleting", async () => {
    const { itemId } = ok(await save());
    ok(await run((ctx) => fees.setItemActive(ctx, itemId, false)));
    expect((await db.feeScheduleItem.findUniqueOrThrow({ where: { id: itemId } })).active).toBe(
      false,
    );
    ok(await run((ctx) => fees.setItemActive(ctx, itemId, true)));
    expect(await db.auditLog.count({ where: { action: "fin.fee.deactivate" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "fin.fee.activate" } })).toBe(1);
  });

  it("refuses every change in a closed year (AC-5)", async () => {
    const r = await save({ academicYearId: closedYearId });
    expect(code(r)).toBe("CONFLICT:YEAR_CLOSED");
    const { itemId } = ok(await save());
    await db.academicYear.update({ where: { id: yearId }, data: { status: "CLOSED" } });
    expect(code(await run((ctx) => fees.setItemActive(ctx, itemId, false)))).toBe(
      "CONFLICT:YEAR_CLOSED",
    );
    expect(code(await generate())).toBe("CONFLICT:YEAR_CLOSED");
  });

  it("enforces the money rules in the database too (AC-12)", async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO fee_schedule_items (id, program_id, academic_year_id, kind, label, amount, updated_at) VALUES ('x', '${progId}', '${yearId}', 'TUITION', 'neg', -5, now())`,
      ),
    ).rejects.toThrow();
  });
});

describe("generatePlans (AC-6, AC-7)", () => {
  it("refuses when the program has no active fees", async () => {
    expect(fields(await generate()).programId).toEqual(["noFees"]);
    const { itemId } = ok(await save());
    ok(await run((ctx) => fees.setItemActive(ctx, itemId, false)));
    expect(fields(await generate()).programId).toEqual(["noFees"]);
  });

  it("creates plans for registered open enrollments only, and skips existing ones", async () => {
    ok(await save());
    ok(await save({ kind: "ADMINISTRATIVE", amount: "50", installments: [], discounts: [] }));
    const first = ok(await generate());
    expect(first).toEqual({ created: 3, skipped: 0 });
    const planned = await db.paymentPlan.findMany({ select: { enrollmentId: true } });
    expect(planned.map((p) => p.enrollmentId).sort()).toEqual([en1, en2, enSusp].sort());
    expect([enGone, enNoReg].some((id) => planned.some((p) => p.enrollmentId === id))).toBe(false);
    expect(ok(await generate())).toEqual({ created: 0, skipped: 3 });
    expect(await db.auditLog.count({ where: { action: "fin.plan.create" } })).toBe(3);
  });

  it("copies installments ordered by date, with the single-installment fallback and early amounts", async () => {
    ok(await save());
    ok(await save({ kind: "ADMINISTRATIVE", amount: "50", installments: [], discounts: [] }));
    ok(await generate());
    const plan = await db.paymentPlan.findFirstOrThrow({
      where: { enrollmentId: en1 },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    expect(
      plan.installments.map((i) => [
        i.kind,
        i.dueDate.toISOString().slice(0, 10),
        i.amount.toFixed(2),
        i.earlyAmount?.toFixed(2) ?? null,
      ]),
    ).toEqual([
      ["ADMINISTRATIVE", "2026-09-01", "50.00", null],
      ["TUITION", "2026-10-01", "600.00", "540.00"],
      ["TUITION", "2027-02-01", "400.00", "360.00"],
    ]);
    const view = await getPlan({ id: "fin" }, plan.id);
    expect(view?.total).toBe("1050.00");
    expect(view?.earlyTotal).toBe("950.00");
  });

  it("generates for one student number, and refuses an unknown one", async () => {
    ok(await save());
    const st = await db.student.findFirstOrThrow({ where: { enrollments: { some: { id: en2 } } } });
    expect(ok(await generate({ studentNumber: st.studentNumber }))).toEqual({
      created: 1,
      skipped: 0,
    });
    expect(fields(await generate({ studentNumber: "999999" })).studentNumber).toEqual(["notFound"]);
    expect(ok(await generate())).toEqual({ created: 2, skipped: 1 });
  });

  it("ignores fees of other programs and other years", async () => {
    ok(await save({ programId: prog2Id }));
    expect(fields(await generate()).programId).toEqual(["noFees"]);
  });
});

describe("adjusting a plan (AC-8)", () => {
  let planId: string, instId: string;
  beforeEach(async () => {
    ok(await save());
    ok(await generate({ studentNumber: null }));
    const plan = await db.paymentPlan.findFirstOrThrow({
      where: { enrollmentId: en1 },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    planId = plan.id;
    instId = plan.installments[0]!.id;
  });

  it("changes amount and date with a reason, clears the early amount and audits before/after", async () => {
    ok(
      await run((ctx) =>
        plans.adjustInstallment(
          ctx,
          { installmentId: instId, amount: 55000, dueDate: "2026-11-01" },
          "hardship",
        ),
      ),
    );
    const row = await db.planInstallment.findUniqueOrThrow({ where: { id: instId } });
    expect(row.amount.toFixed(2)).toBe("550.00");
    expect(row.earlyAmount).toBeNull();
    expect(row.earlyUntil).toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "fin.plan.adjust" } });
    expect(audit.reason).toBe("hardship");
    expect(JSON.stringify(audit.before)).toContain("600.00");
    expect(JSON.stringify(audit.after)).toContain("550.00");
  });

  it("keeps the early amount when only the date changes", async () => {
    ok(
      await run((ctx) =>
        plans.adjustInstallment(
          ctx,
          { installmentId: instId, amount: 60000, dueDate: "2026-10-15" },
          "later",
        ),
      ),
    );
    expect(
      (await db.planInstallment.findUniqueOrThrow({ where: { id: instId } })).earlyAmount?.toFixed(
        2,
      ),
    ).toBe("540.00");
  });

  it("refuses invalid amounts and dates", async () => {
    const r = await run((ctx) =>
      plans.adjustInstallment(
        ctx,
        { installmentId: instId, amount: 0, dueDate: "2026-13-01" },
        "x",
      ),
    );
    expect(fields(r)).toEqual({ dueDate: ["invalidDate"], amount: ["range"] });
  });

  it("adds an installment by hand and cancels one, keeping it visible", async () => {
    const added = ok(
      await run((ctx) =>
        plans.addInstallment(
          ctx,
          { planId, kind: "OTHER", label: "Late fee", amount: 2500, dueDate: "2027-03-01" },
          "agreed",
        ),
      ),
    );
    ok(await run((ctx) => plans.cancelInstallment(ctx, instId, "waived")));
    const view = await getPlan({ id: "fin" }, planId);
    expect(view?.installments).toHaveLength(3);
    expect(view?.installments.find((i) => i.id === instId)?.status).toBe("CANCELLED");
    expect(view?.installments.find((i) => i.id === added.installmentId)?.sequence).toBe(3);
    expect(view?.count).toBe(2);
    expect(view?.total).toBe("425.00");
    expect(code(await run((ctx) => plans.cancelInstallment(ctx, instId, "again")))).toBe(
      "CONFLICT:CANCELLED",
    );
    expect(await db.auditLog.count({ where: { action: "fin.plan.add_installment" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "fin.plan.cancel_installment" } })).toBe(1);
  });

  it("refuses changes in a closed year", async () => {
    await db.academicYear.update({ where: { id: yearId }, data: { status: "CLOSED" } });
    expect(code(await run((ctx) => plans.cancelInstallment(ctx, instId, "late")))).toBe(
      "CONFLICT:YEAR_CLOSED",
    );
  });
});

describe("permissions and reads (AC-11)", () => {
  it("lets finance write and read, the secretariat read only, everyone else nothing", async () => {
    for (const [u, perm, expected] of [
      ["fin", "fin.fee.write", true],
      ["fin", "fin.plan.write", true],
      ["sec", "fin.fee.read", true],
      ["sec", "fin.plan.read", true],
      ["sec", "fin.fee.write", false],
      ["sec", "fin.plan.write", false],
      ["lec", "fin.fee.read", false],
      ["lec", "fin.plan.read", false],
      ["stu", "fin.plan.read", false],
    ] as const)
      expect(await can({ id: u }, perm), `${u} ${perm}`).toBe(expected);
  });

  it("reads the board and a plan for readers, and nothing for others", async () => {
    ok(await save());
    ok(await generate());
    const board = await feeBoard({ id: "sec" }, yearId);
    expect(board.find((p) => p.code === "P1")?.items).toHaveLength(1);
    const planId = (await db.paymentPlan.findFirstOrThrow()).id;
    expect(await getPlan({ id: "sec" }, planId)).not.toBeNull();
    expect(await feeBoard({ id: "lec" }, yearId)).toEqual([]);
    expect(await getPlan({ id: "lec" }, planId)).toBeNull();
  });
});
