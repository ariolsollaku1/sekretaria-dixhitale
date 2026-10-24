import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { parseTableParams } from "@/lib/tables/params";
import type { SearchParams } from "@/lib/tables/types";
import { resolveRecipients } from "@/modules/ntf";
import "@/modules/org";
import "../permissions";
import { clearanceTable, deadlinesTable } from "./list.table";

const selected = vi.hoisted(() => ({ yearId: null as string | null }));
vi.mock("@/lib/academic-year/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-year/context")>()),
  getSelectedAcademicYear: async () => selected.yearId,
}));

// Dates far from "today": the first installment is long due, the second is not due yet.
const PAST_DUE = "2025-10-01";
const MID_DUE = "2027-01-10";
const FUTURE_DUE = "2099-02-01";

let yearId: string;
const ids: Record<string, string> = {};

const run = async <R>(
  def: {
    fetch: (p: never, c: { user: { id: string } }) => Promise<{ rows: R[]; total: number }>;
  } & Parameters<typeof parseTableParams>[1],
  userId: string,
  search: SearchParams = {},
) => def.fetch(parseTableParams(search, def) as never, { user: { id: userId } });

async function user(id: string, role: string, scopeType = "INSTITUTION", scopeId?: string) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: {
      userId: id,
      role: role as never,
      scopeType: scopeType as never,
      scopeId: scopeId ?? null,
    },
  });
}

async function mkPlan(enrollmentId: string, rows: { due: string; amount: string }[]) {
  const plan = await db.paymentPlan.create({ data: { enrollmentId, academicYearId: yearId } });
  for (const [i, r] of rows.entries())
    await db.planInstallment.create({
      data: {
        planId: plan.id,
        sequence: i + 1,
        kind: "TUITION",
        dueDate: new Date(`${r.due}T00:00:00Z`),
        amount: r.amount,
      },
    });
  return plan.id;
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "payments", "plan_installments", "payment_plans", "exam_sessions", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f1 = await db.faculty.create({ data: { code: "F1", name: "F1" } });
  const f2 = await db.faculty.create({ data: { code: "F2", name: "F2" } });
  const d1 = await db.department.create({ data: { code: "D1", name: "D1", facultyId: f1.id } });
  const d2 = await db.department.create({ data: { code: "D2", name: "D2", facultyId: f2.id } });
  const mkProg = (departmentId: string, code: string) =>
    db.studyProgram.create({
      data: { departmentId, cycle: "FIRST", code, name: code, durationYears: 3, totalCredits: 180 },
    });
  const p1 = await mkProg(d1.id, "P1");
  const p2 = await mkProg(d2.id, "P2");
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
  selected.yearId = yearId;
  const plan = (
    await db.curriculumPlan.create({
      data: { programId: p1.id, version: 1, validFromAcademicYearId: yearId, status: "DRAFT" },
    })
  ).id;
  const course = await db.course.create({
    data: { code: "CA", name: "CA", defaultCredits: 6, departmentId: d1.id },
  });
  await db.planCourse.create({
    data: { planId: plan, courseId: course.id, yearOfStudy: 1, semester: 1, credits: 6 },
  });
  await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
  const cohort = (
    await db.cohort.create({
      data: { programId: p1.id, startAcademicYearId: yearId, curriculumPlanId: plan, name: "C" },
    })
  ).id;
  const enroll = async (n: string, programId: string) => {
    const p = await db.person.create({
      data: {
        firstName: n,
        lastName: "L",
        gender: "MALE",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        email: `${n}@t.test`,
        phone: `+355-${n}`,
      },
    });
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
    return { en: en.id, person: p.id, number: st.studentNumber };
  };
  // a: pays the past installment fully; b: owes the past one; c: other faculty, owes
  const a = await enroll("a", p1.id);
  const b = await enroll("b", p1.id);
  const c = await enroll("c", p2.id);
  Object.assign(ids, {
    aNumber: a.number,
    bNumber: b.number,
    cNumber: c.number,
    aPerson: a.person,
  });
  const planA = await mkPlan(a.en, [
    { due: PAST_DUE, amount: "500.00" },
    { due: MID_DUE, amount: "300.00" },
  ]);
  await db.payment.create({
    data: {
      planId: planA,
      amount: "500.00",
      paidOn: new Date("2025-09-20T00:00:00Z"),
      reference: "R",
      method: "CASH",
    },
  });
  await mkPlan(b.en, [
    { due: PAST_DUE, amount: "400.00" },
    { due: FUTURE_DUE, amount: "400.00" },
  ]);
  await mkPlan(c.en, [{ due: PAST_DUE, amount: "250.00" }]);
  await user("fin", "finance");
  await user("sec", "secretary");
  await user("secF1", "secretary", "FACULTY", f1.id);
  await user("lec", "lecturer");
});

describe("deadline list (AC-1, AC-7)", () => {
  it("lists installments by due date with paid, outstanding and status", async () => {
    const { rows, total } = await run(deadlinesTable, "fin");
    expect(total).toBe(5);
    expect(rows.map((r) => r.dueDate)).toEqual(
      [PAST_DUE, PAST_DUE, PAST_DUE, MID_DUE, FUTURE_DUE].sort(),
    );
    const a1 = rows.find((r) => r.studentNumber === ids.aNumber && r.dueDate === PAST_DUE)!;
    expect(a1).toMatchObject({ paid: "500.00", outstanding: "0.00", status: "PAID" });
    const b1 = rows.find((r) => r.studentNumber === ids.bNumber && r.dueDate === PAST_DUE)!;
    expect(b1).toMatchObject({ paid: "0.00", outstanding: "400.00", status: "OVERDUE" });
    const b2 = rows.find((r) => r.dueDate === FUTURE_DUE)!;
    expect(b2.status).toBe("UNPAID");
  });

  it("filters by due-date range and status, and sorts descending", async () => {
    const range = await run(deadlinesTable, "fin", { dueFrom: "2027-01-01", dueTo: "2027-12-31" });
    expect(range.rows.map((r) => r.dueDate)).toEqual([MID_DUE]);
    const overdue = await run(deadlinesTable, "fin", { status: "OVERDUE" });
    expect(overdue.rows.map((r) => r.studentNumber).sort()).toEqual(
      [ids.bNumber, ids.cNumber].sort(),
    );
    const desc = await run(deadlinesTable, "fin", { sort: "dueDate:desc" });
    expect(desc.rows[0]!.dueDate).toBe(FUTURE_DUE);
  });

  it("applies the program scope and refuses no-permission users through the recipient resolver", async () => {
    const all = await run(deadlinesTable, "sec");
    expect(all.total).toBe(5);
    const scoped = await run(deadlinesTable, "secF1");
    expect(scoped.total).toBe(4);
    expect(scoped.rows.some((r) => r.studentNumber === ids.cNumber)).toBe(false);
    await expect(resolveRecipients({ id: "lec" }, "fin.lists.deadlines", {})).rejects.toThrow();
  });

  it("returns nothing without a selected year", async () => {
    selected.yearId = null;
    expect((await run(deadlinesTable, "fin")).total).toBe(0);
  });
});

describe("clearance and debtors list (AC-2..AC-5, AC-7)", () => {
  it("as of today: cleared = nothing due is outstanding; contact data shown", async () => {
    const { rows } = await run(clearanceTable, "fin", { asOf: "2026-01-01" });
    const byNumber = Object.fromEntries(rows.map((r) => [r.studentNumber, r]));
    expect(byNumber[ids.aNumber!]).toMatchObject({
      result: "CLEARED",
      owed: "0.00",
      email: "a@t.test",
      phone: "+355-a",
    });
    expect(byNumber[ids.bNumber!]).toMatchObject({ result: "NOT_CLEARED", owed: "400.00" });
  });

  it("uses the day before the chosen session; a missing session gives an empty list", async () => {
    // session starts 2027-01-11: the installment due 2027-01-10 of student a counts, 2099 one does not
    await db.examSession.create({
      data: {
        academicYearId: yearId,
        type: "WINTER",
        startDate: new Date("2027-01-11T00:00:00Z"),
        endDate: new Date("2027-01-31T00:00:00Z"),
      },
    });
    const w = await run(clearanceTable, "fin", { session: "WINTER" });
    const a = w.rows.find((r) => r.studentNumber === ids.aNumber)!;
    expect(a).toMatchObject({ date: "2027-01-10", result: "NOT_CLEARED", owed: "300.00" });
    // a session starting on 2027-01-10 is checked on 2027-01-09: a's second installment is not yet due
    await db.examSession.update({
      where: { academicYearId_type: { academicYearId: yearId, type: "WINTER" } },
      data: { startDate: new Date("2027-01-10T00:00:00Z") },
    });
    const w2 = await run(clearanceTable, "fin", { session: "WINTER" });
    expect(w2.rows.find((r) => r.studentNumber === ids.aNumber)).toMatchObject({
      date: "2027-01-09",
      result: "CLEARED",
    });
    const none = await run(clearanceTable, "fin", { session: "SUMMER" });
    expect(none).toEqual({ rows: [], total: 0 });
  });

  it("debtors = not cleared, sorted by amount owed", async () => {
    const debtors = await run(clearanceTable, "fin", {
      result: "NOT_CLEARED",
      asOf: "2026-01-01",
      sort: "owed:desc",
    });
    expect(debtors.rows.map((r) => r.studentNumber)).toEqual([ids.bNumber, ids.cNumber]);
    const cleared = await run(clearanceTable, "fin", { result: "CLEARED", asOf: "2026-01-01" });
    expect(cleared.rows.map((r) => r.studentNumber)).toEqual([ids.aNumber]);
  });

  it("applies the program scope; recipients are the listed people", async () => {
    const scoped = await run(clearanceTable, "secF1", { asOf: "2026-01-01" });
    expect(scoped.rows.map((r) => r.studentNumber).sort()).toEqual(
      [ids.aNumber, ids.bNumber].sort(),
    );
    const rec = await resolveRecipients({ id: "fin" }, "fin.lists.clearance", {
      result: "CLEARED",
      asOf: "2026-01-01",
    });
    expect(rec.personIds).toEqual([ids.aPerson]);
    await expect(resolveRecipients({ id: "lec" }, "fin.lists.clearance", {})).rejects.toThrow();
  });
});
