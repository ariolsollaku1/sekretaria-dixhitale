import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { blockingCohortDependents, blockingGroupDependents } from "@/modules/org";
import "@/modules/cur";
import "@/modules/stu";
import { personalSchema, type PersonalFormInput } from "../domain/schemas";
import { getOwnStudent, getStudent, scopeWhere } from "./student.queries";
import { registerEnrollmentOpenedHandler } from "./status-hooks";
import * as svc from "./student.service";

const actor = { id: "sec-1", email: "s@t.test", name: "Sec", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "stu.student.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let prog1: string, prog2: string, cohort1: string, cohort2: string, cohortP2: string;
let y25: string, y26: string, closedYear: string;
let g1y1: string, g1y2: string, g2y1: string;

const person = (over: Partial<PersonalFormInput> = {}) =>
  personalSchema.parse({
    firstName: "Ana",
    lastName: "Leka",
    gender: "FEMALE",
    birthDate: "2003-04-05",
    nationalId: "K30405001A",
    email: "ana@student.test",
    phone: "+355 69 111 2222",
    address: "Rruga 1",
    residence: "Tiranë",
    nim: "NIM-1",
    ...over,
  });
const enrollment = (over: Record<string, unknown> = {}) => ({
  programId: prog1,
  cohortId: cohort1,
  registrationType: "FIRST_TIME" as const,
  startedAt: "2026-09-15",
  ...over,
});
const register = (
  over: Partial<PersonalFormInput> = {},
  withEnrollment: Record<string, unknown> | null = {},
) =>
  run((ctx) =>
    svc.registerStudent(ctx, {
      ...person(over),
      enrollment: withEnrollment === null ? null : enrollment(withEnrollment),
    }),
  );

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "year_registrations", "enrollment_status_events", "enrollments", "students", "student_groups", "cohorts", "curriculum_plans", "staff", "user_roles", "study_programs", "departments", "faculties", "academic_years" CASCADE',
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
  y25 = await mkYear("2025-2026", "2025-09-01", "CLOSED");
  y26 = await mkYear("2026-2027", "2026-09-01", "CURRENT");
  const mkPlan = (programId: string) =>
    db.curriculumPlan
      .create({ data: { programId, version: 1, validFromAcademicYearId: y25, status: "APPROVED" } })
      .then((p) => p.id);
  const plan1 = await mkPlan(prog1);
  const plan2 = await mkPlan(prog2);
  const mkCohort = (
    programId: string,
    curriculumPlanId: string,
    name: string,
    startAcademicYearId = y25,
    active = true,
  ) =>
    db.cohort
      .create({ data: { programId, curriculumPlanId, name, startAcademicYearId, active } })
      .then((c) => c.id);
  cohort1 = await mkCohort(prog1, plan1, "2025");
  cohort2 = await mkCohort(prog1, plan1, "2026", y26);
  cohortP2 = await mkCohort(prog2, plan2, "p2");
  const mkGroup = (cohortId: string, academicYearId: string, yearOfStudy: number, name = "G1") =>
    db.studentGroup
      .create({ data: { cohortId, academicYearId, yearOfStudy, name } })
      .then((g) => g.id);
  g1y1 = await mkGroup(cohort1, y26, 1); // deliberately "wrong" expected year: allowed by ORG-04
  g1y2 = await mkGroup(cohort1, y26, 2);
  g2y1 = await mkGroup(cohort2, y26, 1);
});

describe("registerStudent (AC-1..AC-5)", () => {
  it("creates person, student and first enrollment with a generated number, history and masked audit", async () => {
    const r = ok(await register());
    expect(r.studentNumber).toMatch(/^\d{6}$/);
    const student = await db.student.findUniqueOrThrow({
      where: { id: r.studentId },
      include: { person: true, enrollments: { include: { history: true } } },
    });
    expect(student).toMatchObject({ nim: "NIM-1" });
    expect(student.person).toMatchObject({
      lastName: "Leka",
      residence: "Tiranë",
      nationalId: "K30405001A",
    });
    expect(student.enrollments).toHaveLength(1);
    expect(student.enrollments[0]).toMatchObject({
      status: "ACTIVE",
      programId: prog1,
      cohortId: cohort1,
    });
    expect(student.enrollments[0]!.history).toMatchObject([
      { fromStatus: null, toStatus: "ACTIVE" },
    ]);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "stu.student.create" } });
    const after = audit.after as Record<string, unknown>;
    expect(after.lastName).toBe("Leka");
    for (const k of ["nationalId", "birthDate", "phone", "address"]) expect(after[k]).toBe("***");
    expect(JSON.stringify(audit)).not.toContain("K30405001A");
    expect(await db.auditLog.count({ where: { action: "stu.enrollment.create" } })).toBe(1);
  });

  it("numbers students in sequence and never reuses a number", async () => {
    const a = ok(await register());
    const b = ok(await register({ nationalId: "B1", email: "b@student.test", nim: "NIM-2" }, null));
    expect(Number(b.studentNumber)).toBe(Number(a.studentNumber) + 1);
    expect(b.enrollmentId).toBeNull();
  });

  it("refuses duplicates and bad references, writing nothing", async () => {
    ok(await register());
    expect(await register({ nationalId: "OTHER", email: "o@student.test" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    }); // NIM taken
    expect(await register({ nim: "NIM-9" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    }); // already a student
    expect(
      await register(
        { nim: "NIM-9", nationalId: "N9", email: "n9@student.test" },
        { cohortId: cohortP2 },
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } }); // cohort of another program
    expect(
      await register(
        { nim: "NIM-9", nationalId: "N9", email: "n9@student.test" },
        { programId: "nope" },
      ),
    ).toMatchObject({ ok: false });
    await db.cohort.update({ where: { id: cohort2 }, data: { active: false } });
    expect(
      await register(
        { nim: "NIM-9", nationalId: "N9", email: "n9@student.test" },
        { cohortId: cohort2 },
      ),
    ).toMatchObject({ ok: false });
    expect(await db.student.count()).toBe(1);
    expect(await db.person.count()).toBe(1);
  });

  it("attaches to an existing person who is only staff and leaves their data unchanged; links the account", async () => {
    const p = await db.person.create({
      data: {
        firstName: "Old",
        lastName: "Name",
        gender: "MALE",
        birthDate: new Date("1980-01-01T00:00:00Z"),
        nationalId: "K30405001A",
      },
    });
    await db.user.create({ data: { id: "u1", email: "ANA@student.test", name: "Ana" } });
    const r = ok(await register());
    const student = await db.student.findUniqueOrThrow({
      where: { id: r.studentId },
      include: { person: true },
    });
    expect(student.personId).toBe(p.id);
    expect(student.person.firstName).toBe("Old");
    expect((await db.user.findUniqueOrThrow({ where: { id: "u1" } })).personId).toBe(p.id);
  });
});

describe("enrollments (AC-2, AC-3)", () => {
  it("allows one open enrollment per program, several programs, and a new one after the first ended", async () => {
    const { studentId } = ok(await register());
    expect(await run((ctx) => svc.addEnrollment(ctx, studentId, enrollment()))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    ok(
      await run((ctx) =>
        svc.addEnrollment(
          ctx,
          studentId,
          enrollment({ programId: prog2, cohortId: cohortP2, registrationType: "SECOND_PROGRAM" }),
        ),
      ),
    );
    await db.enrollment.updateMany({
      where: { programId: prog1 },
      data: { status: "DEREGISTERED" },
    });
    ok(await run((ctx) => svc.addEnrollment(ctx, studentId, enrollment({ cohortId: cohort2 }))));
    expect(await db.enrollment.count({ where: { studentId } })).toBe(3);
  });

  it("tells the registered handlers about every new open enrollment, inside the transaction (IAM-02)", async () => {
    const seen: string[] = [];
    registerEnrollmentOpenedHandler("test.opened", async (_ctx, e) => void seen.push(e.programId));
    const { studentId, enrollmentId } = ok(await register());
    expect(seen).toEqual([prog1]);
    ok(
      await run((ctx) =>
        svc.addEnrollment(
          ctx,
          studentId,
          enrollment({ programId: prog2, cohortId: cohortP2, registrationType: "SECOND_PROGRAM" }),
        ),
      ),
    );
    expect(seen).toEqual([prog1, prog2]);
    expect(enrollmentId).toBeTruthy();
    registerEnrollmentOpenedHandler("test.opened", async () => undefined);
  });

  it("enforces the rule in the database too, for SUSPENDED as well", async () => {
    const { studentId } = ok(await register());
    await db.enrollment.updateMany({ where: { studentId }, data: { status: "SUSPENDED" } });
    await expect(
      db.enrollment.create({
        data: {
          studentId,
          programId: prog1,
          cohortId: cohort2,
          registrationType: "TRANSFER",
          startedAt: new Date("2026-09-15T00:00:00Z"),
        },
      }),
    ).rejects.toThrow();
    expect(
      await run((ctx) => svc.addEnrollment(ctx, studentId, enrollment({ cohortId: cohort2 }))),
    ).toMatchObject({ ok: false });
  });
});

describe("updateStudent (AC-6)", () => {
  it("changes data and NIM, audits a masked diff, refuses identifiers used by someone else", async () => {
    const { studentId } = ok(await register());
    const other = ok(
      await register({ nationalId: "B1", email: "b@student.test", nim: "NIM-2" }, null),
    );
    void other;
    ok(
      await run((ctx) =>
        svc.updateStudent(
          ctx,
          studentId,
          person({ phone: "+355 69 999 9999", residence: "Durrës", nim: "NIM-1B" }),
        ),
      ),
    );
    const row = await db.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { person: true },
    });
    expect(row).toMatchObject({ nim: "NIM-1B" });
    expect(row.person.residence).toBe("Durrës");
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "stu.student.update" } });
    expect(JSON.stringify(audit)).not.toContain("+355 69 999 9999");
    expect(JSON.stringify(audit.after)).toContain("Durrës");

    expect(
      await run((ctx) => svc.updateStudent(ctx, studentId, person({ nim: "NIM-2" }))),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await run((ctx) => svc.updateStudent(ctx, studentId, person({ nationalId: "B1" }))),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await run((ctx) => svc.updateStudent(ctx, "missing", person()))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("year registrations (AC-7, AC-8, AC-12)", () => {
  it("registers a year in a group of the cohort for that year and year of study, once", async () => {
    const { enrollmentId } = ok(await register());
    const reg = { enrollmentId: enrollmentId!, academicYearId: y26, yearOfStudy: 1, groupId: g1y1 };
    ok(await run((ctx) => svc.registerYear(ctx, reg)));
    expect(await run((ctx) => svc.registerYear(ctx, reg))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    }); // twice
    expect(await db.auditLog.count({ where: { action: "stu.year_registration.create" } })).toBe(1);
  });

  it("refuses wrong groups, years, statuses and closed years", async () => {
    const { enrollmentId } = ok(await register());
    const reg = (over: Record<string, unknown>) =>
      run((ctx) =>
        svc.registerYear(ctx, {
          enrollmentId: enrollmentId!,
          academicYearId: y26,
          yearOfStudy: 1,
          groupId: g1y1,
          ...over,
        } as never),
      );
    expect(await reg({ groupId: g2y1 })).toMatchObject({ ok: false }); // group of another cohort
    expect(await reg({ groupId: g1y2 })).toMatchObject({ ok: false }); // group of another year of study
    expect(await reg({ yearOfStudy: 4 })).toMatchObject({ ok: false });
    expect(await reg({ academicYearId: y25 })).toMatchObject({ ok: false }); // closed
    expect(await reg({ academicYearId: closedYear })).toMatchObject({ ok: false });
    expect(await reg({ groupId: "nope" })).toMatchObject({ ok: false });
    await db.enrollment.update({ where: { id: enrollmentId! }, data: { status: "SUSPENDED" } });
    expect(await reg({})).toMatchObject({ ok: false });
    expect(await db.yearRegistration.count()).toBe(0);
  });

  it("changes the group within the same cohort, year and year of study", async () => {
    const { enrollmentId } = ok(await register());
    const { yearRegistrationId } = ok(
      await run((ctx) =>
        svc.registerYear(ctx, {
          enrollmentId: enrollmentId!,
          academicYearId: y26,
          yearOfStudy: 1,
          groupId: g1y1,
        }),
      ),
    );
    const other = (
      await db.studentGroup.create({
        data: { cohortId: cohort1, academicYearId: y26, yearOfStudy: 1, name: "G2" },
      })
    ).id;
    ok(await run((ctx) => svc.changeGroup(ctx, yearRegistrationId, other)));
    expect(
      (await db.yearRegistration.findUniqueOrThrow({ where: { id: yearRegistrationId } })).groupId,
    ).toBe(other);
    expect(await run((ctx) => svc.changeGroup(ctx, yearRegistrationId, g1y2))).toMatchObject({
      ok: false,
    });
    expect(await run((ctx) => svc.changeGroup(ctx, yearRegistrationId, g2y1))).toMatchObject({
      ok: false,
    });
    expect(
      await db.auditLog.count({ where: { action: "stu.year_registration.update_group" } }),
    ).toBe(1);
  });

  it("blocks deactivating a cohort with open enrollments and a group with registrations", async () => {
    const { enrollmentId } = ok(await register());
    expect((await blockingCohortDependents(cohort1)).map((b) => b.id)).toEqual(["stu.enrollments"]);
    expect(await blockingCohortDependents(cohort2)).toEqual([]);
    ok(
      await run((ctx) =>
        svc.registerYear(ctx, {
          enrollmentId: enrollmentId!,
          academicYearId: y26,
          yearOfStudy: 1,
          groupId: g1y1,
        }),
      ),
    );
    expect((await blockingGroupDependents(g1y1)).map((b) => b.id)).toEqual([
      "stu.yearRegistrations",
    ]);
    expect(await blockingGroupDependents(g1y2)).toEqual([]);
    await db.enrollment.update({ where: { id: enrollmentId! }, data: { status: "GRADUATED" } });
    expect(await blockingCohortDependents(cohort1)).toEqual([]);
  });
});

describe("queries: scope, masking, own record (AC-9..AC-11)", () => {
  async function user(
    id: string,
    role: "secretary" | "finance" | "program_coordinator" | "student",
    scope?: { id: string },
    personId?: string,
  ) {
    await db.user.create({ data: { id, email: `${id}@t.test`, name: id, personId } });
    await db.userRole.create({
      data: {
        userId: id,
        role,
        scopeType: scope ? "PROGRAM" : role === "student" ? "SELF" : "INSTITUTION",
        scopeId: scope?.id ?? null,
      },
    });
  }

  it("lets institution readers see all, a coordinator only their program's students, and masks identifiers without the permission", async () => {
    const a = ok(await register());
    const b = ok(
      await register(
        { nationalId: "B1", email: "b@student.test", nim: "NIM-2" },
        { programId: prog2, cohortId: cohortP2 },
      ),
    );
    await user("sec", "secretary");
    await user("fin", "finance");
    await user("coord", "program_coordinator", { id: prog1 });

    const ids = async (u: string) =>
      (await db.student.findMany({ where: await scopeWhere({ id: u }), select: { id: true } }))
        .map((s) => s.id)
        .sort();
    expect(await ids("sec")).toEqual([a.studentId, b.studentId].sort());
    expect(await ids("fin")).toEqual([a.studentId, b.studentId].sort());
    expect(await ids("coord")).toEqual([a.studentId]);

    expect(await getStudent({ id: "coord" }, b.studentId)).toBeNull();
    expect((await getStudent({ id: "sec" }, a.studentId))!.student).toMatchObject({
      nationalId: "K30405001A",
      birthDate: "2003-04-05",
      address: "Rruga 1",
    });
    const asFinance = (await getStudent({ id: "fin" }, a.studentId))!;
    expect(asFinance.student).toMatchObject({
      lastName: "Leka",
      nim: "NIM-1",
      residence: "Tiranë",
      nationalId: null,
      birthDate: null,
      address: null,
    });
    expect(asFinance.enrollments).toHaveLength(1);
  });

  it("shows a student only their own record", async () => {
    const a = ok(await register());
    ok(await register({ nationalId: "B1", email: "b@student.test", nim: "NIM-2" }));
    const person = (await db.student.findUniqueOrThrow({ where: { id: a.studentId } })).personId;
    await user("me", "student", undefined, person);
    await user("nobody", "student");
    expect((await getOwnStudent({ id: "me" }))!.student).toMatchObject({
      id: a.studentId,
      nationalId: "K30405001A",
    });
    expect(await getOwnStudent({ id: "nobody" })).toBeNull();
  });
});
