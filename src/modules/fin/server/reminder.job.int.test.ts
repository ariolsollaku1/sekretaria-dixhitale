import { beforeEach, describe, expect, it } from "vitest";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import "@/modules/org";
import "../permissions";
import { sendPaymentReminders } from "./reminder.job";
import { remindersTable } from "./reminder.table";

const now = new Date("2026-10-26T06:00:00Z"); // 2026-10-26 in Europe/Tirane
const day = (offset: number) =>
  new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

let yearId: string, progId: string, prog2Id: string, cohortId: string;
let n = 0;

async function student(opts: {
  account?: boolean;
  status?: "ACTIVE" | "SUSPENDED";
  prog?: string;
}) {
  n += 1;
  const p = await db.person.create({
    data: {
      firstName: `S${n}`,
      lastName: "L",
      gender: "MALE",
      birthDate: new Date("1995-01-01T00:00:00Z"),
      email: `s${n}@t.test`,
    },
  });
  const st = await db.student.create({ data: { personId: p.id } });
  const en = await db.enrollment.create({
    data: {
      studentId: st.id,
      programId: opts.prog ?? progId,
      cohortId,
      registrationType: "FIRST_TIME",
      status: opts.status ?? "ACTIVE",
      startedAt: new Date("2026-01-01T00:00:00Z"),
    },
  });
  if (opts.account !== false) await account(`stu${n}`, p.id);
  return { personId: p.id, studentId: st.id, enrollmentId: en.id, userId: `stu${n}` };
}
async function account(id: string, personId: string) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id, personId } });
  await db.userRole.create({ data: { userId: id, role: "student", scopeType: "SELF" } });
}
async function plan(enrollmentId: string, rows: { due: string; amount: string }[]) {
  const pl = await db.paymentPlan.create({ data: { enrollmentId, academicYearId: yearId } });
  const ids: string[] = [];
  for (const [i, r] of rows.entries()) {
    const c = await db.planInstallment.create({
      data: {
        planId: pl.id,
        sequence: i + 1,
        kind: "TUITION",
        dueDate: new Date(`${r.due}T00:00:00Z`),
        amount: r.amount,
      },
    });
    ids.push(c.id);
  }
  return { planId: pl.id, ids };
}
const setting = (key: string, value: unknown) =>
  db.systemSetting.create({ data: { key, value: value as never } });

beforeEach(async () => {
  n = 0;
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "payment_reminders", "notifications", "email_outbox", "payments", "plan_installments", "payment_plans", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
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
  const cp = await db.curriculumPlan.create({
    data: { programId: progId, version: 1, validFromAcademicYearId: yearId, status: "DRAFT" },
  });
  const course = await db.course.create({
    data: { code: "CA", name: "CA", defaultCredits: 6, departmentId: dep.id },
  });
  await db.planCourse.create({
    data: { planId: cp.id, courseId: course.id, yearOfStudy: 1, semester: 1, credits: 6 },
  });
  await db.curriculumPlan.update({ where: { id: cp.id }, data: { status: "APPROVED" } });
  cohortId = (
    await db.cohort.create({
      data: {
        programId: progId,
        startAcademicYearId: yearId,
        curriculumPlanId: cp.id,
        name: "C",
      },
    })
  ).id;
});

describe("sendPaymentReminders: upcoming (AC-1, AC-2, AC-4)", () => {
  it("reminds the student once, with the outstanding amount, and changes no plan data", async () => {
    const s = await student({});
    const { planId, ids } = await plan(s.enrollmentId, [
      { due: day(14), amount: "500.00" }, // exactly two weeks: reminded
      { due: day(15), amount: "500.00" }, // not yet
      { due: day(-20), amount: "500.00" }, // long past: no overdue notice by default
    ]);
    // 100 paid towards the installment due in 14 days? Payments go to the oldest installment first.
    await db.payment.create({
      data: {
        planId,
        amount: "100.00",
        paidOn: new Date(`${day(-1)}T00:00:00Z`),
        reference: "R1",
        method: "CASH",
        installmentId: ids[0],
      },
    });
    const before = await db.planInstallment.findMany({ orderBy: { sequence: "asc" } });

    const r = await sendPaymentReminders(now);
    expect(r).toEqual({ candidates: 1, sent: 1, noAccount: 0 });
    const notes = await db.notification.findMany();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      userId: s.userId,
      type: "fin.payment-due",
      link: "/fin/mine",
    });
    expect(notes[0]!.body).toContain("400.00");
    expect(notes[0]!.body).toContain("1"); // installment number
    const mail = await db.emailOutbox.findMany();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.toAddress).toBe(`${s.userId}@t.test`);
    const log = await db.paymentReminder.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      installmentId: ids[0],
      studentId: s.studentId,
      kind: "UPCOMING",
      outcome: "SENT",
      userId: s.userId,
    });
    expect(log[0]!.outstanding.toFixed(2)).toBe("400.00");

    // the same day, and the next days: nothing more for this installment
    expect(await sendPaymentReminders(now)).toMatchObject({ candidates: 0, sent: 0 });
    expect(await sendPaymentReminders(new Date(now.getTime() + 86_400_000))).toMatchObject({
      sent: 1, // the installment due in 15 days entered the window; the first one is not repeated
    });
    expect(await db.paymentReminder.count({ where: { installmentId: ids[0] } })).toBe(1);
    expect(await db.notification.count()).toBe(2);
    expect(await db.planInstallment.findMany({ orderBy: { sequence: "asc" } })).toEqual(before);
    expect(await db.payment.count()).toBe(1);
  });

  it("does not remind settled installments, other enrollment states or installments outside the window", async () => {
    const paid = await student({});
    const p1 = await plan(paid.enrollmentId, [{ due: day(5), amount: "300.00" }]);
    await db.payment.create({
      data: {
        planId: p1.planId,
        amount: "300.00",
        paidOn: new Date(`${day(-2)}T00:00:00Z`),
        reference: "R",
        method: "CASH",
      },
    });
    const away = await student({ status: "SUSPENDED" });
    await plan(away.enrollmentId, [{ due: day(5), amount: "300.00" }]);
    const cancelled = await student({});
    const p3 = await plan(cancelled.enrollmentId, [{ due: day(5), amount: "300.00" }]);
    await db.planInstallment.update({
      where: { id: p3.ids[0]! },
      data: { status: "CANCELLED", cancelReason: "SCHOLARSHIP" },
    });
    const far = await student({});
    await plan(far.enrollmentId, [{ due: day(40), amount: "300.00" }]);

    expect(await sendPaymentReminders(now)).toEqual({ candidates: 0, sent: 0, noAccount: 0 });
    expect(await db.notification.count()).toBe(0);
    expect(await db.paymentReminder.count()).toBe(0);
  });

  it("honours the configured window", async () => {
    const s = await student({});
    await plan(s.enrollmentId, [{ due: day(30), amount: "300.00" }]);
    expect(await sendPaymentReminders(now)).toMatchObject({ sent: 0 });
    await setting("fin.reminderDaysBefore", 30);
    expect(await sendPaymentReminders(now)).toMatchObject({ sent: 1 });
  });
});

describe("sendPaymentReminders: students without an account (AC-5)", () => {
  it("logs it once and sends when an account appears", async () => {
    const s = await student({ account: false });
    const { ids } = await plan(s.enrollmentId, [{ due: day(3), amount: "300.00" }]);
    expect(await sendPaymentReminders(now)).toEqual({ candidates: 1, sent: 0, noAccount: 1 });
    expect(await sendPaymentReminders(now)).toEqual({ candidates: 1, sent: 0, noAccount: 0 });
    expect(await db.paymentReminder.findMany()).toHaveLength(1);
    expect(await db.notification.count()).toBe(0);

    await account("late", s.personId);
    expect(await sendPaymentReminders(now)).toEqual({ candidates: 1, sent: 1, noAccount: 0 });
    const rows = await db.paymentReminder.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((x) => x.outcome)).toEqual(["NO_ACCOUNT", "SENT"]);
    expect(rows.every((x) => x.installmentId === ids[0])).toBe(true);
    expect(await sendPaymentReminders(now)).toMatchObject({ candidates: 0 });
  });

  it("does not notify an inactive account", async () => {
    const s = await student({});
    await db.user.update({ where: { id: s.userId }, data: { active: false } });
    await plan(s.enrollmentId, [{ due: day(3), amount: "300.00" }]);
    expect(await sendPaymentReminders(now)).toMatchObject({ sent: 0, noAccount: 1 });
  });
});

describe("sendPaymentReminders: overdue notice (AC-3)", () => {
  it("is off by default, and once switched on sends one notice per installment", async () => {
    const s = await student({});
    const { ids } = await plan(s.enrollmentId, [
      { due: day(-10), amount: "300.00" },
      { due: day(-2), amount: "200.00" },
    ]);
    expect(await sendPaymentReminders(now)).toMatchObject({ sent: 0 });

    await setting("fin.reminderOverdueAfterDays", 5);
    const r = await sendPaymentReminders(now);
    expect(r).toMatchObject({ candidates: 1, sent: 1 });
    const log = await db.paymentReminder.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ installmentId: ids[0], kind: "OVERDUE", outcome: "SENT" });
    const note = await db.notification.findFirstOrThrow();
    expect(note.type).toBe("fin.payment-overdue");

    expect(await sendPaymentReminders(now)).toMatchObject({ candidates: 0 });
    // three days later the second installment is 5 days overdue as well
    expect(await sendPaymentReminders(new Date(now.getTime() + 3 * 86_400_000))).toMatchObject({
      sent: 1,
    });
    expect(await db.paymentReminder.count()).toBe(2);
  });

  it("cannot record the same SENT reminder twice (database guard)", async () => {
    const s = await student({});
    const { ids } = await plan(s.enrollmentId, [{ due: day(3), amount: "300.00" }]);
    await sendPaymentReminders(now);
    await expect(
      db.paymentReminder.create({
        data: {
          installmentId: ids[0]!,
          studentId: s.studentId,
          kind: "UPCOMING",
          outcome: "SENT",
          dueDate: new Date(`${day(3)}T00:00:00Z`),
          outstanding: "300.00",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("reminder log (AC-6, AC-7)", () => {
  const base = {
    columns: [] as string[],
    page: 1,
    pageSize: 25,
    filters: {},
    sort: { key: "sentOn", dir: "desc" as const },
  };

  it("lists the reminders for Finance and the Secretariat within their program scope, never for others", async () => {
    const a = await student({});
    await plan(a.enrollmentId, [{ due: day(3), amount: "300.00" }]);
    const b = await student({ prog: prog2Id });
    await plan(b.enrollmentId, [{ due: day(4), amount: "200.00" }]);
    await sendPaymentReminders(now);

    await db.user.create({ data: { id: "fin", email: "fin@t.test", name: "fin" } });
    await db.userRole.create({
      data: { userId: "fin", role: "finance", scopeType: "INSTITUTION" },
    });
    await db.user.create({ data: { id: "coord", email: "c@t.test", name: "coord" } });
    await db.userRole.create({
      data: { userId: "coord", role: "secretary", scopeType: "PROGRAM", scopeId: progId },
    });
    await db.user.create({ data: { id: "lec", email: "l@t.test", name: "lec" } });
    await db.userRole.create({
      data: { userId: "lec", role: "lecturer", scopeType: "INSTITUTION" },
    });

    const all = await remindersTable.fetch(base, { user: { id: "fin" } });
    expect(all.total).toBe(2);
    expect(all.rows.map((r) => r.program).sort()).toEqual(["P1", "P2"]);
    expect(all.rows[0]).toMatchObject({ kind: "UPCOMING", outcome: "SENT" });

    const scoped = await remindersTable.fetch(base, { user: { id: "coord" } });
    expect(scoped.rows.map((r) => r.program)).toEqual(["P1"]);

    const filtered = await remindersTable.fetch(
      { ...base, filters: { outcome: "NO_ACCOUNT" } },
      { user: { id: "fin" } },
    );
    expect(filtered.total).toBe(0);

    expect(await can({ id: "fin" }, "fin.payment.read")).toBe(true);
    expect(await can({ id: "coord" }, "fin.payment.read")).toBe(true);
    expect(await can({ id: "lec" }, "fin.payment.read")).toBe(false);
    expect(await can({ id: a.userId }, "fin.payment.read")).toBe(false);
  });
});
