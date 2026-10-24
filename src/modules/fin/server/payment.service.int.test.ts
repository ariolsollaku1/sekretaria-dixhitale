import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "../permissions";
import { recordPaymentSchema, type RecordPaymentInput } from "../domain/schemas";
import * as imports from "./payment-import.service";
import {
  getFinancialClearance,
  getFinancialClearances,
  getOwnFinance,
  getPlanFinance,
} from "./payment.queries";
import * as payments from "./payment.service";

let actorId = "fin";
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
    permission: "fin.payment.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const code = (r: ActionResult<unknown>) => (r.ok ? "OK" : `${r.error.code}:${r.error.message}`);
const fields = (r: ActionResult<unknown>) => (r.ok ? {} : (r.error.fieldErrors ?? {}));

// Dates far from "today": the first installment is long due, the second is not due yet.
const PAST_DUE = "2025-10-01";
const FUTURE_DUE = "2099-02-01";
const EARLY_UNTIL = "2025-09-15";

let yearId: string, oldYearId: string, progId: string, prog2Id: string;
let en1: string, en2: string, st1: string;
let planId: string, inst1: string, inst2: string;

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
async function user(id: string, role: string, personId?: string) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id, personId } });
  await db.userRole.create({
    data: {
      userId: id,
      role: role as never,
      scopeType: role === "student" ? "SELF" : "INSTITUTION",
      scopeId: null,
    },
  });
}

async function mkPlan(
  enrollmentId: string,
  academicYearId: string,
  rows: { due: string; amount: string; early?: [string, string] }[],
) {
  const plan = await db.paymentPlan.create({ data: { enrollmentId, academicYearId } });
  const ids: string[] = [];
  for (const [i, r] of rows.entries()) {
    const created = await db.planInstallment.create({
      data: {
        planId: plan.id,
        sequence: i + 1,
        kind: "TUITION",
        dueDate: new Date(`${r.due}T00:00:00Z`),
        amount: r.amount,
        earlyAmount: r.early?.[0] ?? null,
        earlyUntil: r.early ? new Date(`${r.early[1]}T00:00:00Z`) : null,
      },
    });
    ids.push(created.id);
  }
  return { planId: plan.id, ids };
}

const input = (over: Record<string, unknown> = {}): RecordPaymentInput =>
  recordPaymentSchema.parse({
    planId,
    amount: "100.00",
    paidOn: "2025-09-10",
    reference: "R1",
    method: "BANK_TRANSFER",
    ...over,
  });
const record = (over: Record<string, unknown> = {}) =>
  run((ctx) => payments.recordPayment(ctx, input(over)));

beforeEach(async () => {
  actorId = "fin";
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "payments", "plan_installments", "payment_plans", "fee_discounts", "fee_installment_templates", "fee_schedule_items", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } });
  const mkProg = (c: string) =>
    db.studyProgram
      .create({
        data: {
          departmentId: dep.id,
          cycle: "FIRST",
          code: c,
          name: c,
          durationYears: 3,
          totalCredits: 180,
        },
      })
      .then((p) => p.id);
  progId = await mkProg("P1");
  prog2Id = await mkProg("P2");
  oldYearId = (
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
      data: { programId: progId, startAcademicYearId: yearId, curriculumPlanId: plan, name: "C" },
    })
  ).id;
  const enroll = async (n: string, programId = progId) => {
    const p = await person(n);
    const st = await db.student.create({ data: { personId: p.id } });
    const en = await db.enrollment.create({
      data: {
        studentId: st.id,
        programId,
        cohortId: cohort,
        registrationType: "FIRST_TIME",
        status: "ACTIVE",
        startedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    return { en: en.id, st: st.id, person: p.id };
  };
  const s1 = await enroll("s1");
  const s2 = await enroll("s2");
  en1 = s1.en;
  st1 = s1.st;
  en2 = s2.en;
  await user("fin", "finance");
  await user("sec", "secretary");
  await user("lec", "lecturer");
  await user("stu1", "student", s1.person);
  await user("stu2", "student", s2.person);
  await user("nolink", "student");
  const mine = await mkPlan(en1, yearId, [
    { due: PAST_DUE, amount: "600.00", early: ["540.00", EARLY_UNTIL] },
    { due: FUTURE_DUE, amount: "400.00" },
  ]);
  planId = mine.planId;
  [inst1, inst2] = mine.ids as [string, string];
  await mkPlan(en2, yearId, [{ due: PAST_DUE, amount: "300.00" }]);
});

describe("recordPayment (AC-1, AC-2, AC-13)", () => {
  it("records a payment and audits it", async () => {
    const r = ok(await record());
    const row = await db.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    expect(row).toMatchObject({ status: "RECORDED", reference: "R1", method: "BANK_TRANSFER" });
    expect(row.amount.toFixed(2)).toBe("100.00");
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "fin.payment.record" } });
    expect(audit.entityId).toBe(r.paymentId);
    expect(audit.after).toMatchObject({ amount: "100.00", paidOn: "2025-09-10" });
  });

  it("refuses bad amounts, future dates and installments of other plans or cancelled", async () => {
    expect(fields(await record({ amount: "0" }))).toHaveProperty("amount");
    expect(fields(await record({ paidOn: "2999-01-01" }))).toEqual({ paidOn: ["future"] });
    const other = await db.planInstallment.findFirstOrThrow({
      where: { planId: { not: planId } },
    });
    expect(fields(await record({ installmentId: other.id }))).toEqual({
      installmentId: ["notInPlan"],
    });
    await db.planInstallment.update({ where: { id: inst2 }, data: { status: "CANCELLED" } });
    expect(fields(await record({ installmentId: inst2 }))).toEqual({
      installmentId: ["CANCELLED"],
    });
    expect(code(await record({ planId: "missing" }))).toBe("NOT_FOUND:Plan not found");
    expect(await db.payment.count()).toBe(0);
  });

  it("works on a plan of a closed academic year (AC-13)", async () => {
    const old = await mkPlan(en2, oldYearId, [{ due: "2020-10-01", amount: "200.00" }]);
    ok(await record({ planId: old.planId, amount: "50" }));
    expect(await db.payment.count({ where: { planId: old.planId } })).toBe(1);
  });

  it("voids with a reason, keeps the row and stops counting it", async () => {
    const { paymentId } = ok(await record({ amount: "600.00" }));
    expect((await getPlanFinance({ id: "fin" }, planId))!.paid).toBe("600.00");
    ok(await run((ctx) => payments.voidPayment(ctx, paymentId, "wrong student")));
    const row = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(row).toMatchObject({ status: "VOIDED", voidReason: "wrong student", voidedById: "fin" });
    const view = (await getPlanFinance({ id: "fin" }, planId))!;
    expect(view.paid).toBe("0.00");
    expect(view.payments).toHaveLength(1);
    expect(view.payments[0]).toMatchObject({ status: "VOIDED", voidReason: "wrong student" });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "fin.payment.void" } });
    expect(audit.before).toMatchObject({ status: "RECORDED" });
    expect(audit.after).toMatchObject({ status: "VOIDED" });
    expect(audit.reason).toBe("wrong student");
    expect(code(await run((ctx) => payments.voidPayment(ctx, paymentId, "again")))).toBe(
      "CONFLICT:VOIDED",
    );
  });
});

describe("balances (AC-3..AC-5, AC-10)", () => {
  it("spreads payments, honours the early amount and reports totals", async () => {
    ok(await record({ amount: "540.00", paidOn: "2025-09-10", installmentId: inst1 }));
    ok(await record({ amount: "100.00", paidOn: "2025-10-20" }));
    const v = (await getPlanFinance({ id: "sec" }, planId))!;
    expect(v.installments[inst1]).toMatchObject({
      paid: "540.00",
      waived: "60.00",
      outstanding: "0.00",
      status: "PAID",
      settledEarly: true,
    });
    expect(v.installments[inst2]).toMatchObject({
      paid: "100.00",
      outstanding: "300.00",
      status: "PARTIAL",
    });
    expect(v.due).toBe("940.00");
    expect(v.paid).toBe("640.00");
    expect(v.outstanding).toBe("300.00");
    expect(v.overdue).toBe("0.00");
    expect(v.clearedToday).toBe(true);
    expect(v.payments).toHaveLength(2);
  });

  it("shows overdue and not cleared when the due installment is unpaid", async () => {
    ok(await record({ amount: "100.00", paidOn: "2025-10-20" }));
    const v = (await getPlanFinance({ id: "fin" }, planId))!;
    expect(v.installments[inst1]).toMatchObject({ outstanding: "500.00", status: "OVERDUE" });
    expect(v.overdue).toBe("500.00");
    expect(v.clearedToday).toBe(false);
  });

  it("keeps a credit for an overpayment", async () => {
    ok(await record({ amount: "1100.00", paidOn: "2025-10-20" }));
    const v = (await getPlanFinance({ id: "fin" }, planId))!;
    expect(v.outstanding).toBe("0.00");
    expect(v.credit).toBe("100.00");
  });

  it("is invisible to roles without payment read", async () => {
    expect(await getPlanFinance({ id: "lec" }, planId)).toBeNull();
    expect(await getPlanFinance({ id: "stu1" }, planId)).toBeNull();
  });
});

describe("financial clearance (AC-6)", () => {
  it("depends on the date and on every plan of the student", async () => {
    expect(await getFinancialClearance(st1, "2025-09-30")).toMatchObject({
      cleared: true,
      owed: "0.00",
    });
    expect(await getFinancialClearance(st1, "2025-10-01")).toMatchObject({
      cleared: false,
      owed: "600.00",
    });
    ok(await record({ amount: "600.00", paidOn: "2025-10-02" }));
    expect(await getFinancialClearance(st1, "2026-12-31")).toMatchObject({ cleared: true });
    expect(await getFinancialClearance(st1, "2099-02-01")).toMatchObject({
      cleared: false,
      owed: "400.00",
    });
    // a debt of an older (closed) year still counts
    await mkPlan(en1, oldYearId, [{ due: "2021-01-01", amount: "75.50" }]);
    expect(await getFinancialClearance(st1, "2026-12-31")).toMatchObject({
      cleared: false,
      owed: "75.50",
    });
  });

  it("answers for many students at once and clears students without a plan", async () => {
    const other = await db.student.findFirstOrThrow({ where: { id: { not: st1 } } });
    const none = await db.person.create({
      data: {
        firstName: "n",
        lastName: "n",
        gender: "MALE",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        email: "n@t.test",
      },
    });
    const planless = await db.student.create({ data: { personId: none.id } });
    const m = await getFinancialClearances([st1, other.id, planless.id], "2026-12-31");
    expect([...m.values()].map((c) => c.cleared)).toEqual([false, false, true]);
    expect(m.get(other.id)!.owed).toBe("300.00");
  });
});

describe("own view (AC-11)", () => {
  it("shows a student only their own plans and payments", async () => {
    ok(await record({ amount: "50.00", paidOn: "2025-10-20", reference: "mine" }));
    const own = (await getOwnFinance({ id: "stu1" }))!;
    expect(own.plans).toHaveLength(1);
    expect(own.plans[0]!.id).toBe(planId);
    expect(own.plans[0]!.payments.map((p) => p.reference)).toEqual(["mine"]);
    expect(own.cleared).toBe(false);
    const other = (await getOwnFinance({ id: "stu2" }))!;
    expect(other.plans).toHaveLength(1);
    expect(other.plans[0]!.id).not.toBe(planId);
    expect(other.plans[0]!.payments).toEqual([]);
  });
  it("is null without a student record", async () => {
    expect(await getOwnFinance({ id: "nolink" })).toBeNull();
  });
});

describe("permissions (AC-12)", () => {
  it("lets finance write, the secretariat read, students see their own, others nothing", async () => {
    for (const [u, perm, expected] of [
      ["fin", "fin.payment.write", true],
      ["fin", "fin.payment.read", true],
      ["sec", "fin.payment.read", true],
      ["sec", "fin.payment.write", false],
      ["stu1", "fin.payment.self", true],
      ["stu1", "fin.payment.read", false],
      ["stu1", "fin.payment.write", false],
      ["lec", "fin.payment.read", false],
      ["lec", "fin.payment.self", false],
    ] as const)
      expect(await can({ id: u }, perm), `${u} ${perm}`).toBe(expected);
  });
});

describe("payment import (AC-7, AC-8)", () => {
  const file = (text: string, name = "p.csv") => ({
    name,
    bytes: new TextEncoder().encode(text),
  });
  const HEAD = "student_number,nim,amount,paid_on,reference,method\n";
  let n1: string, n2: string;
  beforeEach(async () => {
    n1 = (await db.student.findUniqueOrThrow({ where: { id: st1 } })).studentNumber;
    n2 = (await db.student.findFirstOrThrow({ where: { id: { not: st1 } } })).studentNumber;
  });

  it("previews new, duplicate and invalid rows without saving", async () => {
    ok(await record({ amount: "100.00", paidOn: "2025-09-10", reference: "R1" }));
    const csv =
      HEAD +
      `${n1},,100.00,2025-09-10,R1,bank\n` + // duplicate of the recorded one
      `${n2},,300,10.09.2025,B-77,cash\n` + // new
      `999999,,10,2025-09-10,x,\n` + // unknown student
      `${n1},,abc,2999-01-01,,\n`; // bad amount and future date
    const p = await imports.previewPaymentImport(file(csv), yearId);
    if (!p.ok) throw new Error(p.error);
    expect(p.rows.map((r) => [r.row, r.status])).toEqual([
      [2, "duplicate"],
      [3, "new"],
    ]);
    expect(p.errors.map((e) => `${e.row}:${e.code}`)).toEqual(["4:noPlan", "5:amount", "5:future"]);
    expect(p.counts).toMatchObject({ total: 4, valid: 2, invalid: 2, created: 1, duplicates: 1 });
    expect(await db.payment.count()).toBe(1);
  });

  it("commits the new rows, skips duplicates, audits and tags the batch", async () => {
    ok(await record({ amount: "100.00", paidOn: "2025-09-10", reference: "R1" }));
    const csv = HEAD + `${n1},,100.00,2025-09-10,R1,\n${n2},,300,2025-09-11,B-77,cash\n`;
    const r = ok(await run((ctx) => imports.commitPaymentImport(ctx, file(csv), yearId)));
    expect(r).toEqual({ created: 1, skipped: 1 });
    const rows = await db.payment.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ reference: "B-77", method: "CASH" });
    expect(rows[1]!.importBatch).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "fin.payment.import" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "fin.payment.record" } })).toBe(2);
    // running the same file again changes nothing
    const again = ok(await run((ctx) => imports.commitPaymentImport(ctx, file(csv), yearId)));
    expect(again).toEqual({ created: 0, skipped: 2 });
    expect(await db.payment.count()).toBe(2);
  });

  it("is all or nothing when a row is invalid", async () => {
    const csv = HEAD + `${n2},,300,2025-09-11,ok,\n${n1},,-5,2025-09-11,bad,\n`;
    const r = await run((ctx) => imports.commitPaymentImport(ctx, file(csv), yearId));
    expect(code(r)).toBe("VALIDATION:IMPORT_HAS_ERRORS");
    expect(await db.payment.count()).toBe(0);
  });

  it("matches by NIM, flags ambiguous students and repeated rows", async () => {
    await db.student.update({ where: { id: st1 }, data: { nim: "NIM-1" } });
    const byNim = await imports.previewPaymentImport(
      file(HEAD + ",NIM-1,50,2025-09-11,a,\n"),
      yearId,
    );
    if (!byNim.ok) throw new Error(byNim.error);
    expect(byNim.rows[0]).toMatchObject({ studentNumber: n1, planId, status: "new" });

    // a second enrollment of the same student with a plan in the same year
    const second = await db.enrollment.create({
      data: {
        studentId: st1,
        programId: prog2Id,
        cohortId: (await db.cohort.findFirstOrThrow()).id,
        registrationType: "FIRST_TIME",
        status: "ACTIVE",
        startedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await mkPlan(second.id, yearId, [{ due: PAST_DUE, amount: "10.00" }]);
    const amb = await imports.previewPaymentImport(
      file(HEAD + `${n1},,50,2025-09-11,a,\n${n2},,5,2025-09-11,t,\n${n2},,5,2025-09-11,t,\n`),
      yearId,
    );
    if (!amb.ok) throw new Error(amb.error);
    expect(amb.errors.map((e) => `${e.row}:${e.code}`)).toEqual([
      "2:ambiguousPlan",
      "4:duplicateInFile",
    ]);
  });

  it("rejects unreadable files and missing columns", async () => {
    expect(await imports.previewPaymentImport(file("", "x.csv"), yearId)).toMatchObject({
      ok: false,
      error: "empty",
    });
    expect(await imports.previewPaymentImport(file("a,b\n1,2\n"), yearId)).toMatchObject({
      ok: false,
      error: "missingColumns",
    });
    expect(await imports.previewPaymentImport(file("x", "x.txt"), yearId)).toMatchObject({
      ok: false,
      error: "unsupportedFile",
    });
  });
});
