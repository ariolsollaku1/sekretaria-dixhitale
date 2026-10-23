import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/stu";
import { personalSchema } from "../domain/schemas";
import { registerStatusChangeHandler, resetStatusChangeHandlers } from "./status-hooks";
import { notifyStudent } from "./status-notification";
import * as status from "./status.service";
import * as students from "./student.service";

let actorId = "sec-1";
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
    permission: "stu.student.write",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let prog1: string, prog2: string, cohort1: string, cohort1b: string, cohort2: string;
let studentId: string, enrollmentId: string;
const today = new Date().toISOString().slice(0, 10);
const change = (
  to: "ACTIVE" | "SUSPENDED" | "DEREGISTERED" | "GRADUATED",
  over: Record<string, unknown> = {},
  reason: string | null = "Kërkesë e studentit",
) =>
  run(
    (ctx) =>
      status.changeEnrollmentStatus(ctx, {
        enrollmentId,
        to,
        effectiveDate: today,
        documentRef: null,
        ...over,
      } as never),
    reason ?? undefined,
  );

beforeEach(async () => {
  resetStatusChangeHandlers();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "notifications", "email_outbox", "year_registrations", "enrollment_status_events", "enrollments", "students", "student_groups", "cohorts", "curriculum_plans", "user_roles", "study_programs", "departments", "faculties", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const d = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  const mkProg = (code: string) =>
    db.studyProgram
      .create({
        data: {
          departmentId: d.id,
          cycle: "FIRST",
          code,
          name: code,
          durationYears: 3,
          totalCredits: 180,
        },
      })
      .then((p) => p.id);
  prog1 = await mkProg("P1");
  prog2 = await mkProg("P2");
  const year = (
    await db.academicYear.create({
      data: {
        code: "2025-2026",
        startDate: new Date("2025-09-01T00:00:00Z"),
        endDate: new Date("2026-08-31T00:00:00Z"),
        status: "CURRENT",
      },
    })
  ).id;
  const mkPlan = (programId: string) =>
    db.curriculumPlan
      .create({
        data: { programId, version: 1, validFromAcademicYearId: year, status: "APPROVED" },
      })
      .then((p) => p.id);
  const plan1 = await mkPlan(prog1);
  const plan2 = await mkPlan(prog2);
  const mkCohort = (programId: string, curriculumPlanId: string, name: string) =>
    db.cohort
      .create({ data: { programId, curriculumPlanId, name, startAcademicYearId: year } })
      .then((c) => c.id);
  cohort1 = await mkCohort(prog1, plan1, "A");
  cohort1b = await mkCohort(prog1, plan1, "B");
  cohort2 = await mkCohort(prog2, plan2, "C");
  const r = ok(
    await run((ctx) =>
      students.registerStudent(ctx, {
        ...personalSchema.parse({
          firstName: "Ana",
          lastName: "Leka",
          gender: "FEMALE",
          birthDate: "2003-04-05",
          email: "ana@student.test",
        }),
        enrollment: {
          programId: prog1,
          cohortId: cohort1,
          registrationType: "FIRST_TIME",
          startedAt: "2025-09-15",
        },
      }),
    ),
  );
  studentId = r.studentId;
  enrollmentId = r.enrollmentId!;
  actorId = "sec-1";
  await db.user.create({ data: { id: "sec-1", email: "sec@t.test", name: "sec" } });
  await db.userRole.create({
    data: { userId: "sec-1", role: "secretary", scopeType: "INSTITUTION" },
  });
});

describe("changeEnrollmentStatus (AC-1..AC-3)", () => {
  it("suspends and resumes: events, no end date, audit with reason", async () => {
    ok(await change("SUSPENDED", { documentRef: "V-1/2026" }));
    expect(await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).toMatchObject({
      status: "SUSPENDED",
      endedAt: null,
    });
    ok(await change("ACTIVE", {}, "U kthye"));
    const e = await db.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { history: { orderBy: { createdAt: "asc" } } },
    });
    expect(e.status).toBe("ACTIVE");
    expect(e.history.map((h) => [h.fromStatus, h.toStatus, h.reason, h.documentRef])).toEqual([
      [null, "ACTIVE", null, null],
      ["ACTIVE", "SUSPENDED", "Kërkesë e studentit", "V-1/2026"],
      ["SUSPENDED", "ACTIVE", "U kthye", null],
    ]);
    const audit = await db.auditLog.findMany({
      where: { action: "stu.enrollment.change_status" },
      orderBy: { at: "asc" },
    });
    expect(audit.map((a) => a.reason)).toEqual(["Kërkesë e studentit", "U kthye"]);
  });

  it("deregisters and graduates with an end date, and then nothing may change", async () => {
    ok(await change("DEREGISTERED", { effectiveDate: today }));
    const e = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(e.status).toBe("DEREGISTERED");
    expect(e.endedAt?.toISOString().slice(0, 10)).toBe(today);
    expect(await change("ACTIVE")).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await change("GRADUATED")).toMatchObject({ ok: false });
  });

  it("graduates an active enrollment", async () => {
    ok(await change("GRADUATED"));
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status).toBe(
      "GRADUATED",
    );
  });

  it("refuses disallowed changes, bad dates and a missing reason, changing nothing", async () => {
    expect(await change("ACTIVE")).toMatchObject({ ok: false }); // already active
    expect(await change("SUSPENDED", { effectiveDate: "2025-09-14" })).toMatchObject({ ok: false }); // before start
    expect(await change("SUSPENDED", { effectiveDate: "2999-01-01" })).toMatchObject({ ok: false }); // future
    expect(await change("SUSPENDED", { effectiveDate: "nope" })).toMatchObject({ ok: false });
    expect(await change("SUSPENDED", {}, "")).toMatchObject({ ok: false });
    expect(await change("SUSPENDED", {}, null)).toMatchObject({ ok: false });
    ok(await change("SUSPENDED", { effectiveDate: "2025-10-10" }));
    expect(await change("ACTIVE", { effectiveDate: "2025-10-09" })).toMatchObject({ ok: false }); // before previous change
    expect(await db.enrollmentStatusEvent.count({ where: { enrollmentId } })).toBe(2);
  });

  it("answers not found for an unknown enrollment", async () => {
    expect(
      await run(
        (ctx) =>
          status.changeEnrollmentStatus(ctx, {
            enrollmentId: "nope",
            to: "SUSPENDED",
            effectiveDate: today,
            documentRef: null,
          }),
        "x",
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("transferEnrollment (AC-4)", () => {
  const transfer = (programId: string, cohortId: string) =>
    run(
      (ctx) =>
        status.transferEnrollment(ctx, {
          enrollmentId,
          programId,
          cohortId,
          effectiveDate: today,
          documentRef: "T-5",
        }),
      "Transferim",
    );

  it("closes the old enrollment and opens a TRANSFER one in another program", async () => {
    const r = ok(await transfer(prog2, cohort2));
    const old = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(old.status).toBe("DEREGISTERED");
    const fresh = await db.enrollment.findUniqueOrThrow({
      where: { id: r.newEnrollmentId },
      include: { history: true },
    });
    expect(fresh).toMatchObject({
      status: "ACTIVE",
      registrationType: "TRANSFER",
      programId: prog2,
      cohortId: cohort2,
    });
    expect(fresh.startedAt.toISOString().slice(0, 10)).toBe(today);
    expect(await db.auditLog.count({ where: { action: "stu.enrollment.transfer" } })).toBe(1);
  });

  it("works within the same program (another cohort)", async () => {
    const r = ok(await transfer(prog1, cohort1b));
    expect(
      (await db.enrollment.findUniqueOrThrow({ where: { id: r.newEnrollmentId } })).cohortId,
    ).toBe(cohort1b);
  });

  it("rolls everything back when the target is refused", async () => {
    await db.cohort.update({ where: { id: cohort2 }, data: { active: false } });
    expect(await transfer(prog2, cohort2)).toMatchObject({ ok: false });
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status).toBe(
      "ACTIVE",
    );
    expect(await db.enrollment.count()).toBe(1);
    expect(await db.enrollmentStatusEvent.count()).toBe(1);
    // a final enrollment cannot transfer
    await db.cohort.update({ where: { id: cohort2 }, data: { active: true } });
    await db.enrollment.update({ where: { id: enrollmentId }, data: { status: "GRADUATED" } });
    expect(await transfer(prog2, cohort2)).toMatchObject({ ok: false });
  });
});

describe("handlers and notification (AC-5)", () => {
  it("runs registered handlers inside the transaction; a failing handler rolls the change back", async () => {
    const seen: string[] = [];
    registerStatusChangeHandler(
      "test.record",
      async (_ctx, e) => void seen.push(`${e.from}->${e.to}`),
    );
    ok(await change("SUSPENDED"));
    expect(seen).toEqual(["ACTIVE->SUSPENDED"]);

    registerStatusChangeHandler("test.fail", async () => {
      throw new Error("account provisioning is down");
    });
    expect(await change("ACTIVE")).toMatchObject({ ok: false });
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status).toBe(
      "SUSPENDED",
    );
  });

  it("notifies the student when their account is linked", async () => {
    registerStatusChangeHandler("stu.notify-student", notifyStudent);
    const personId = (await db.student.findUniqueOrThrow({ where: { id: studentId } })).personId;
    await db.user.create({
      data: { id: "stu-user", email: "ana@student.test", name: "Ana", personId },
    });
    ok(await change("SUSPENDED"));
    const n = await db.notification.findFirstOrThrow({ where: { userId: "stu-user" } });
    expect(n).toMatchObject({ type: "stu.status", link: "/stu/me" });
    // an unlinked student is simply not notified
    await db.user.update({ where: { id: "stu-user" }, data: { personId: null } });
    ok(await change("ACTIVE"));
    expect(await db.notification.count()).toBe(1);
  });
});

describe("scope (AC-7)", () => {
  it("treats an enrollment outside the user's programs as not found", async () => {
    actorId = "coord";
    await db.user.create({ data: { id: "coord", email: "c@t.test", name: "c" } });
    await db.userRole.create({
      data: { userId: "coord", role: "program_coordinator", scopeType: "PROGRAM", scopeId: prog2 },
    });
    expect(await change("SUSPENDED")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await db.userRole.deleteMany({ where: { userId: "coord" } });
    await db.userRole.create({
      data: { userId: "coord", role: "program_coordinator", scopeType: "PROGRAM", scopeId: prog1 },
    });
    expect((await change("SUSPENDED")).ok).toBe(true);
  });
});
