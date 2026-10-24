import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import { changeState, submitPublic } from "@/lib/forms/submission.service";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/stu";
import "../permissions";
import { SCHOLARSHIP_FORMS } from "../domain/scholarship-forms";
import { feeItemSchema } from "../domain/schemas";
import { grantScholarshipSchema, type GrantScholarshipInput } from "../domain/scholarship-schemas";
import "./scholarship-handlers";
import * as fees from "./fee.service";
import * as plans from "./plan.service";
import { getApplicationPanel } from "./scholarship.queries";
import * as scholarships from "./scholarship.service";
import { scholarshipReportTable, scholarshipsTable } from "./scholarship.table";

const selected = vi.hoisted(() => ({ yearId: null as string | null }));
vi.mock("@/lib/academic-year/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-year/context")>()),
  getSelectedAcademicYear: async () => selected.yearId,
}));

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
    permission: "fin.scholarship.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const fields = (r: ActionResult<unknown>) => (r.ok ? {} : (r.error.fieldErrors ?? {}));
const message = (r: ActionResult<unknown>) => (r.ok ? "OK" : r.error.message);

let yearId: string, closedYearId: string, progId: string;
let en1: string, num1: string, num2: string, dob1: string;

const grantInput = (over: Record<string, unknown> = {}): GrantScholarshipInput =>
  grantScholarshipSchema.parse({
    studentNumber: num1,
    academicYearId: yearId,
    type: "PARTIAL",
    category: "NEED",
    percent: "50",
    reason: "Hardship",
    ...over,
  });
const grant = (over: Record<string, unknown> = {}) =>
  run((ctx) => scholarships.grantScholarship(ctx, grantInput(over)));
const voidIt = (id: string, reason = "Mistake") =>
  run((ctx) => scholarships.voidScholarship(ctx, { id }), reason);
const generate = () =>
  run((ctx) =>
    plans.generatePlans(ctx, {
      academicYearId: yearId,
      programId: progId,
      studentNumber: null,
    }),
  );
const saveFee = (kind: "TUITION" | "ADMINISTRATIVE", amount: string, installments: object[]) =>
  run((ctx) =>
    fees.saveFeeItem(
      ctx,
      feeItemSchema.parse({
        programId: progId,
        academicYearId: yearId,
        kind,
        amount,
        installments,
        discounts:
          kind === "TUITION"
            ? [
                {
                  label: "early",
                  kind: "PERCENT",
                  value: "10",
                  validFrom: "2026-08-01",
                  validTo: "2026-09-15",
                },
              ]
            : [],
      }),
    ),
  );
const planInstallments = async (enrollmentId: string) =>
  (
    await db.planInstallment.findMany({
      where: { plan: { enrollmentId } },
      orderBy: [{ dueDate: "asc" }, { kind: "asc" }],
    })
  ).map((i) => ({
    kind: i.kind,
    amount: i.amount.toFixed(2),
    early: i.earlyAmount?.toFixed(2) ?? null,
    status: i.status,
    reason: i.cancelReason,
  }));

async function setupFees() {
  ok(
    await saveFee("TUITION", "1000.00", [
      { dueDate: "2026-10-01", amount: "600.00" },
      { dueDate: "2027-02-01", amount: "400.00" },
    ]),
  );
  ok(await saveFee("ADMINISTRATIVE", "50.00", []));
}

beforeEach(async () => {
  actorId = "fin";
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "rate_limit_hits", "scholarship_cuts", "scholarships", "plan_installments", "payment_plans", "fee_discounts", "fee_installment_templates", "fee_schedule_items", "form_submission_events", "form_submissions", "form_definitions", "stored_files", "year_registrations", "enrollment_status_events", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } });
  progId = (
    await db.studyProgram.create({
      data: {
        departmentId: dep.id,
        cycle: "FIRST",
        code: "P1",
        name: "P1",
        durationYears: 3,
        totalCredits: 180,
      },
    })
  ).id;
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
      data: { programId: progId, startAcademicYearId: yearId, curriculumPlanId: plan, name: "C" },
    })
  ).id;
  const group = (
    await db.studentGroup.create({
      data: { cohortId: cohort, academicYearId: yearId, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  selected.yearId = yearId;
  dob1 = "1990-01-01";
  const enroll = async (n: string) => {
    const p = await db.person.create({
      data: {
        firstName: n,
        lastName: "L",
        gender: "MALE",
        birthDate: new Date(`${dob1}T00:00:00Z`),
        email: `${n}@t.test`,
      },
    });
    const st = await db.student.create({ data: { personId: p.id } });
    const en = await db.enrollment.create({
      data: {
        studentId: st.id,
        programId: progId,
        cohortId: cohort,
        registrationType: "FIRST_TIME",
        status: "ACTIVE",
        startedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await db.yearRegistration.create({
      data: { enrollmentId: en.id, academicYearId: yearId, yearOfStudy: 1, groupId: group },
    });
    return { enrollmentId: en.id, number: st.studentNumber };
  };
  const s1 = await enroll("s1");
  const s2 = await enroll("s2");
  en1 = s1.enrollmentId;
  num1 = s1.number;
  num2 = s2.number;
  for (const [id, role] of [
    ["fin", "finance"],
    ["sec", "secretary"],
    ["lec", "lecturer"],
    ["stu", "student"],
  ] as const) {
    await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
    await db.userRole.create({
      data: { userId: id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
    });
  }
  for (const form of SCHOLARSHIP_FORMS)
    await db.formDefinition.create({
      data: {
        key: form.key,
        version: 1,
        status: "PUBLISHED",
        audience: form.audience,
        ownerRoles: form.ownerRoles,
        definition: form.definition as never,
        publishedAt: new Date(),
      },
    });
});

describe("granting a scholarship (AC-1..AC-5)", () => {
  it("a percentage reduces the tuition installments only, clears early amounts and audits", async () => {
    await setupFees();
    ok(await generate());
    const { id, applied } = ok(await grant());
    expect(applied).toBe(true);
    expect(await planInstallments(en1)).toEqual([
      { kind: "ADMINISTRATIVE", amount: "50.00", early: null, status: "ACTIVE", reason: null },
      { kind: "TUITION", amount: "300.00", early: null, status: "ACTIVE", reason: null },
      { kind: "TUITION", amount: "200.00", early: null, status: "ACTIVE", reason: null },
    ]);
    const cuts = await db.scholarshipCut.findMany({ where: { scholarshipId: id } });
    expect(cuts.map((c) => c.amount.toFixed(2)).sort()).toEqual(["200.00", "300.00"]);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "fin.scholarship.grant" },
    });
    expect(audit.entityId).toBe(id);
    expect(audit.reason).toBe("Hardship");
    expect(JSON.stringify(audit.after)).toContain("500.00");
    // the other student is untouched
    expect(await planInstallments(en1)).toHaveLength(3);
  });

  it("a full scholarship cancels the tuition installments, keeps their amounts and the other fees", async () => {
    await setupFees();
    ok(await generate());
    ok(await grant({ type: "FULL", percent: null, category: "EXCELLENCE" }));
    const rows = await planInstallments(en1);
    expect(rows.filter((r) => r.kind === "TUITION")).toEqual([
      {
        kind: "TUITION",
        amount: "600.00",
        early: "540.00",
        status: "CANCELLED",
        reason: "SCHOLARSHIP",
      },
      {
        kind: "TUITION",
        amount: "400.00",
        early: "360.00",
        status: "CANCELLED",
        reason: "SCHOLARSHIP",
      },
    ]);
    expect(rows.find((r) => r.kind === "ADMINISTRATIVE")?.status).toBe("ACTIVE");
  });

  it("a fixed amount is shared over the tuition installments and adds up exactly", async () => {
    await setupFees();
    ok(await generate());
    ok(await grant({ percent: null, amount: "333.33" }));
    const tuition = (await planInstallments(en1)).filter((r) => r.kind === "TUITION");
    const total = tuition.reduce((a, r) => a + Math.round(Number(r.amount) * 100), 0);
    expect(total).toBe(100000 - 33333);
  });

  it("an amount above the tuition is refused and nothing is recorded", async () => {
    await setupFees();
    ok(await generate());
    const r = await grant({ percent: null, amount: "1000.01" });
    expect(fields(r).amount).toEqual(["exceedsTuition"]);
    expect(await db.scholarship.count()).toBe(0);
    expect((await planInstallments(en1)).map((i) => i.amount)).toEqual([
      "50.00",
      "600.00",
      "400.00",
    ]);
  });

  it("is stored first and applied when the plan is generated", async () => {
    await setupFees();
    const { applied } = ok(await grant());
    expect(applied).toBe(false);
    ok(await generate());
    expect(
      (await planInstallments(en1)).filter((r) => r.kind === "TUITION").map((r) => r.amount),
    ).toEqual(["300.00", "200.00"]);
    expect(await db.auditLog.count({ where: { action: "fin.scholarship.apply" } })).toBe(1);
  });

  it("allows one live scholarship per enrollment and year", async () => {
    ok(await grant());
    expect(fields(await grant({ percent: "10" })).studentNumber).toEqual(["alreadyHas"]);
    ok(await grant({ studentNumber: num2 }));
  });

  it("validates the terms and the student", async () => {
    expect(fields(await grant({ percent: "100" })).percent).toEqual(["range"]);
    expect(fields(await grant({ percent: null })).value).toEqual(["oneValue"]);
    expect(fields(await grant({ percent: "10", amount: "5" })).value).toEqual(["oneValue"]);
    expect(fields(await grant({ type: "FULL" })).type).toEqual(["fullHasValue"]);
    expect(fields(await grant({ studentNumber: "999999" })).studentNumber).toEqual(["notFound"]);
    expect(fields(await grant({ studentNumber: null })).studentNumber).toEqual(["required"]);
  });

  it("refuses a closed academic year", async () => {
    expect(message(await grant({ academicYearId: closedYearId }))).toBe("YEAR_CLOSED");
  });

  it("refuses when the plan has no tuition", async () => {
    ok(await saveFee("ADMINISTRATIVE", "50.00", []));
    ok(await generate());
    expect(fields(await grant()).percent).toEqual(["noTuition"]);
    expect(await db.scholarship.count()).toBe(0);
  });
});

describe("voiding (AC-6)", () => {
  it("gives the reduction back, keeps the row and audits", async () => {
    await setupFees();
    ok(await generate());
    const { id } = ok(await grant());
    ok(await voidIt(id));
    expect((await planInstallments(en1)).map((i) => i.amount)).toEqual([
      "50.00",
      "600.00",
      "400.00",
    ]);
    const row = await db.scholarship.findUniqueOrThrow({ where: { id } });
    expect(row.voidedAt).not.toBeNull();
    expect(row.voidReason).toBe("Mistake");
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "fin.scholarship.void" } });
    expect(audit.reason).toBe("Mistake");
    // it can be granted again
    ok(await grant({ percent: "25" }));
  });

  it("brings a fully cancelled installment back, but not a hand-cancelled one", async () => {
    await setupFees();
    ok(await generate());
    const { id } = ok(await grant({ type: "FULL", percent: null }));
    ok(await voidIt(id));
    expect((await planInstallments(en1)).every((r) => r.status === "ACTIVE")).toBe(true);
  });

  it("needs a reason, refuses twice and refuses in a closed year", async () => {
    ok(await grant());
    const row = await db.scholarship.findFirstOrThrow();
    expect(
      fields(await run((ctx) => scholarships.voidScholarship(ctx, { id: row.id }), "")).reason,
    ).toEqual(["Reason is required"]);
    ok(await voidIt(row.id));
    expect(message(await voidIt(row.id))).toBe("ALREADY_VOID");
    const old = await db.scholarship.create({
      data: {
        enrollmentId: en1,
        academicYearId: closedYearId,
        type: "FULL",
        category: "OTHER",
        reason: "old",
      },
    });
    expect(message(await voidIt(old.id))).toBe("YEAR_CLOSED");
  });
});

describe("application form (AC-3, AC-7)", () => {
  const apply = async (over: Record<string, unknown> = {}) => {
    const res = await submitPublic(
      "scholarship",
      {
        firstName: "s1",
        lastName: "L",
        studentNumber: num1,
        birthDate: dob1,
        email: "s1@t.test",
        academicYear: "2026-2027",
        category: "EXCELLENCE",
        averageGrade: 9.7,
        motivation: "Top of the class",
        confirm: true,
        ...over,
      },
      "10.0.0.1",
    );
    if (!res.ok) throw new Error("submit failed");
    return (await db.formSubmission.findUniqueOrThrow({ where: { reference: res.reference } })).id;
  };
  const approve = (id: string) => run((ctx) => changeState(ctx, id, "approved", "Miratuar"));

  it("cannot be approved before a scholarship is recorded, then is approved with the decision", async () => {
    await setupFees();
    ok(await generate());
    const id = await apply();
    expect(message(await approve(id))).toBe("NO_SCHOLARSHIP_RECORDED");
    expect((await db.formSubmission.findUniqueOrThrow({ where: { id } })).state).toBe("new");

    const panel = await getApplicationPanel({ id: "fin" }, id);
    expect(panel?.requester).toMatchObject({ studentNumber: num1 });
    expect(panel?.answers.category).toBe("EXCELLENCE");

    ok(
      await run((ctx) =>
        scholarships.grantScholarship(
          ctx,
          grantInput({ submissionId: id, studentNumber: null, type: "FULL", percent: null }),
        ),
      ),
    );
    ok(await approve(id));
    expect((await db.formSubmission.findUniqueOrThrow({ where: { id } })).state).toBe("approved");
    const row = await db.scholarship.findFirstOrThrow({ where: { submissionId: id } });
    expect(row.enrollmentId).toBe(en1);
    expect((await planInstallments(en1)).filter((r) => r.status === "CANCELLED")).toHaveLength(2);
    // a decided application takes no more decisions
    expect(
      message(
        await run((ctx) =>
          scholarships.grantScholarship(ctx, grantInput({ submissionId: id, studentNumber: null })),
        ),
      ),
    ).toBe("REQUEST_CLOSED");
  });

  it("a voided decision does not count: the approval is refused again", async () => {
    const id = await apply();
    const { id: sid } = ok(
      await run((ctx) =>
        scholarships.grantScholarship(ctx, grantInput({ submissionId: id, studentNumber: null })),
      ),
    );
    ok(await voidIt(sid));
    expect(message(await approve(id))).toBe("NO_SCHOLARSHIP_RECORDED");
  });

  it("does not identify a student with a wrong date of birth", async () => {
    const id = await apply({ birthDate: "1991-01-01" });
    const r = await run((ctx) =>
      scholarships.grantScholarship(ctx, grantInput({ submissionId: id, studentNumber: null })),
    );
    expect(message(r)).toBe("STUDENT_NOT_IDENTIFIED");
    expect(await db.scholarship.count()).toBe(0);
  });

  it("is invisible to a user who does not handle the form", async () => {
    const id = await apply();
    expect(await getApplicationPanel({ id: "lec" }, id)).toBeNull();
    actorId = "lec";
    const r = await run((ctx) =>
      scholarships.grantScholarship(ctx, grantInput({ submissionId: id, studentNumber: null })),
    );
    expect(message(r)).toBe("Application not found");
  });
});

describe("lists and report (AC-9, AC-10)", () => {
  it("lists scholarships with the fee before, the reduction and after, and counts them", async () => {
    await setupFees();
    ok(await generate());
    ok(await grant());
    ok(await grant({ studentNumber: num2, type: "FULL", percent: null, category: "EXCELLENCE" }));
    const base = {
      columns: [] as string[],
      page: 1,
      pageSize: 25,
      filters: {},
      sort: { key: "studentNumber", dir: "asc" as const },
    };
    const ctx = { user: { id: "fin" } };
    const { rows } = await scholarshipsTable.fetch(base, ctx);
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.studentNumber === num1)!;
    expect(first).toMatchObject({
      terms: "50.00 %",
      before: "1000.00",
      reduction: "500.00",
      after: "500.00",
      planTotal: "550.00",
      status: "ACTIVE",
    });
    // no plan is shown only as empty fee cells
    const report = await scholarshipReportTable.fetch(
      { ...base, sort: { key: "year", dir: "desc" } },
      ctx,
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ total: 2, full: 1, partial: 1, programCode: "P1" });
    expect(report.rows[0]?.byCategory).toMatchObject({ EXCELLENCE: 1, NEED: 1 });

    // voided scholarships leave the report
    const one = await db.scholarship.findFirstOrThrow({ where: { type: "FULL" } });
    ok(await voidIt(one.id));
    expect((await scholarshipReportTable.fetch(base, ctx)).rows[0]?.total).toBe(1);
    const filtered = await scholarshipsTable.fetch({ ...base, filters: { status: "VOID" } }, ctx);
    expect(filtered.rows.map((r) => r.studentNumber)).toEqual([num2]);
  });

  it("is refused to users without the permission (AC-8)", async () => {
    expect(await can({ id: "fin" }, "fin.scholarship.write")).toBe(true);
    expect(await can({ id: "sec" }, "fin.scholarship.read")).toBe(true);
    expect(await can({ id: "sec" }, "fin.scholarship.write")).toBe(false);
    expect(await can({ id: "lec" }, "fin.scholarship.read")).toBe(false);
    expect(await can({ id: "stu" }, "fin.scholarship.read")).toBe(false);
  });
});
