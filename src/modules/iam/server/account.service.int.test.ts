import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/lib/authz/permissions";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/stu";
import "@/modules/hr";
import * as accounts from "./account.service";
import { neverActivatedTable } from "./account.table";
import { FakeIdentityProvider } from "./fake-identity-provider";
import { IdentityProviderError } from "./identity-provider";

let idp: FakeIdentityProvider;
let actorId: string;

function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: actorId,
      email: "actor@t.test",
      name: "Actor",
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "iam.account.student",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const failure = <T>(r: ActionResult<T>) => {
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

let programId: string;
let cohortId: string;
let cohort2Id: string;
let n = 0;

async function makeStudent(over: { email?: string | null; status?: "ACTIVE" | "GRADUATED" } = {}) {
  n++;
  const person = await db.person.create({
    data: {
      firstName: "Stud",
      lastName: `Ent${n}`,
      gender: "FEMALE",
      birthDate: new Date("2003-01-01T00:00:00Z"),
      email: over.email === undefined ? `stud${n}@student.test` : over.email,
    },
  });
  const student = await db.student.create({ data: { personId: person.id } });
  const enrollment = await db.enrollment.create({
    data: {
      studentId: student.id,
      programId,
      cohortId,
      registrationType: "FIRST_TIME",
      status: over.status ?? "ACTIVE",
      startedAt: new Date("2025-09-15T00:00:00Z"),
    },
  });
  return { personId: person.id, studentId: student.id, enrollmentId: enrollment.id };
}

async function makeStaff(
  over: { email?: string | null; active?: boolean; kind?: "ACADEMIC" | "ADMINISTRATIVE" } = {},
) {
  n++;
  const person = await db.person.create({
    data: {
      firstName: "Staf",
      lastName: `Fi${n}`,
      gender: "MALE",
      birthDate: new Date("1980-01-01T00:00:00Z"),
      email: over.email === undefined ? `staff${n}@logos.test` : over.email,
    },
  });
  const staff = await db.staff.create({
    data: {
      personId: person.id,
      kind: over.kind ?? "ACADEMIC",
      category: "PAE",
      contractStart: new Date("2024-09-01T00:00:00Z"),
      active: over.active ?? true,
    },
  });
  return { personId: person.id, staffId: staff.id };
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "enrollment_status_events", "enrollments", "students", "staff", "cohorts", "curriculum_plans", "user_roles", "study_programs", "departments", "faculties", "academic_years" CASCADE',
  );
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
  await db.person.deleteMany();
  idp = new FakeIdentityProvider();

  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const d = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  programId = (
    await db.studyProgram.create({
      data: {
        departmentId: d.id,
        cycle: "FIRST",
        code: "P1",
        name: "P1",
        durationYears: 3,
        totalCredits: 180,
      },
    })
  ).id;
  const year = await db.academicYear.create({
    data: {
      code: "2025-2026",
      startDate: new Date("2025-09-01T00:00:00Z"),
      endDate: new Date("2026-08-31T00:00:00Z"),
      status: "CURRENT",
    },
  });
  const plan = await db.curriculumPlan.create({
    data: { programId, version: 1, validFromAcademicYearId: year.id, status: "APPROVED" },
  });
  const mkCohort = (name: string) =>
    db.cohort
      .create({
        data: { programId, curriculumPlanId: plan.id, name, startAcademicYearId: year.id },
      })
      .then((c) => c.id);
  cohortId = await mkCohort("A");
  cohort2Id = await mkCohort("B");

  // the acting secretary/HR officer (not a system administrator)
  const actor = await db.user.create({ data: { email: "actor@t.test", name: "Actor" } });
  actorId = actor.id;
  for (const role of ["secretary", "hr"] as const)
    await db.userRole.create({ data: { userId: actorId, role, scopeType: "INSTITUTION" } });
});

describe("provisionStudentAccount (AC-1..AC-3)", () => {
  it("creates the login with role student/SELF, links the person and mails the activation after commit", async () => {
    const s = await makeStudent({ email: "Ana@Student.test" });
    const out = ok(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, s.studentId)));
    expect(out.identity).toBe("created");

    const user = await db.user.findUniqueOrThrow({
      where: { email: "ana@student.test" },
      include: { roles: true },
    });
    expect(user).toMatchObject({ personId: s.personId, active: true });
    expect(user.roles).toMatchObject([{ role: "student", scopeType: "SELF" }]);
    expect(idp.emails).toHaveLength(1);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "iam.account.provision" },
    });
    expect(audit).toMatchObject({ entityId: user.id, actorUserId: actorId });
    expect(audit.after).toMatchObject({ kind: "STUDENT", personId: s.personId });
  });

  it("refuses without e-mail, without an open enrollment and when an account exists - and creates nothing", async () => {
    const noMail = await makeStudent({ email: null });
    expect(
      failure(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, noMail.studentId))),
    ).toMatchObject({ code: "VALIDATION", fieldErrors: { account: ["noEmail"] } });

    const alum = await makeStudent({ status: "GRADUATED" });
    expect(
      failure(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, alum.studentId))),
    ).toMatchObject({ fieldErrors: { account: ["noOpenEnrollment"] } });

    const s = await makeStudent();
    ok(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, s.studentId)));
    expect(
      failure(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, s.studentId))),
    ).toMatchObject({ code: "CONFLICT", message: "ACCOUNT_EXISTS" });
    expect(idp.users.size).toBe(1);
    expect(await db.user.count({ where: { personId: { not: null } } })).toBe(1);
  });

  it("adopts a login with that e-mail that belongs to nobody, and refuses one that belongs to someone else", async () => {
    const s = await makeStudent({ email: "adopt@student.test" });
    const existing = await db.user.create({ data: { email: "adopt@student.test", name: "Adopt" } });
    const out = ok(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, s.studentId)));
    expect(out).toMatchObject({ userId: existing.id, identity: "adopted" });
    expect(
      await db.user.findUniqueOrThrow({ where: { id: existing.id }, include: { roles: true } }),
    ).toMatchObject({ personId: s.personId, roles: [{ role: "student" }] });
    expect(idp.users.size).toBe(0);

    const other = await makeStudent({ email: "taken@student.test" });
    const stranger = await makeStaff();
    await db.user.create({
      data: { email: "taken@student.test", name: "Taken", personId: stranger.personId },
    });
    expect(
      failure(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, other.studentId))),
    ).toMatchObject({ fieldErrors: { account: ["emailTaken"] } });
  });

  it("leaves nothing behind when the identity service is down", async () => {
    const s = await makeStudent();
    idp.failWith = new IdentityProviderError("UNAVAILABLE", "down");
    expect(
      failure(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, s.studentId))).code,
    ).toBe("UNAVAILABLE");
    expect(await db.user.count({ where: { personId: s.personId } })).toBe(0);
  });

  it("does not exist for a user without the student scope", async () => {
    const s = await makeStudent();
    await db.userRole.deleteMany({ where: { userId: actorId, role: "secretary" } });
    expect(
      failure(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, s.studentId))).code,
    ).toBe("NOT_FOUND");
  });
});

describe("provisionStaffAccount (AC-4)", () => {
  it("creates the login with the chosen role", async () => {
    const st = await makeStaff();
    const out = ok(
      await run((ctx) =>
        accounts.provisionStaffAccount(ctx, idp, { staffId: st.staffId, role: "lecturer" }),
      ),
    );
    const user = await db.user.findUniqueOrThrow({
      where: { id: out.userId },
      include: { roles: true },
    });
    expect(user).toMatchObject({ personId: st.personId });
    expect(user.roles).toMatchObject([{ role: "lecturer", scopeType: "SELF" }]);
    expect(idp.emails).toHaveLength(1);
  });

  it("refuses roles that need a target, the administrator, and staff who left", async () => {
    const st = await makeStaff();
    for (const role of ["sysadmin", "student", "head_of_department", "program_coordinator"]) {
      expect(
        failure(
          await run((ctx) =>
            accounts.provisionStaffAccount(ctx, idp, { staffId: st.staffId, role }),
          ),
        ),
      ).toMatchObject({ fieldErrors: { role: ["roleNotAllowed"] } });
    }
    const gone = await makeStaff({ active: false });
    expect(
      failure(
        await run((ctx) =>
          accounts.provisionStaffAccount(ctx, idp, { staffId: gone.staffId, role: "lecturer" }),
        ),
      ),
    ).toMatchObject({ fieldErrors: { account: ["notEmployed"] } });
    expect(idp.users.size).toBe(0);
  });
});

describe("syncAccountAccess (AC-5..AC-8)", () => {
  const sync = (personId: string) => run((ctx) => accounts.syncAccountAccess(ctx, idp, personId));
  const provision = async (s: { studentId: string }) =>
    ok(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, s.studentId))).userId;
  const end = (enrollmentId: string, status: "GRADUATED" | "DEREGISTERED" = "GRADUATED") =>
    db.enrollment.update({ where: { id: enrollmentId }, data: { status } });

  it("switches the account off when the last open enrollment ends, and back on with a new one", async () => {
    const s = await makeStudent();
    const userId = await provision(s);
    await db.session.create({
      data: { token: "t", userId, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    await end(s.enrollmentId);
    ok(await sync(s.personId));
    expect(await db.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      active: false,
    });
    expect(await db.session.count({ where: { userId } })).toBe(0);
    const idpUser = await idp.findUserByEmail(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).email,
    );
    expect(idpUser?.enabled).toBe(false);
    expect(await db.auditLog.count({ where: { action: "iam.account.auto_deactivate" } })).toBe(1);

    await db.enrollment.create({
      data: {
        studentId: s.studentId,
        programId,
        cohortId: cohort2Id,
        registrationType: "SECOND_PROGRAM",
        startedAt: new Date("2026-09-01T00:00:00Z"),
      },
    });
    ok(await sync(s.personId));
    expect(await db.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      active: true,
    });
    expect(
      (
        await idp.findUserByEmail(
          (await db.user.findUniqueOrThrow({ where: { id: userId } })).email,
        )
      )?.enabled,
    ).toBe(true);
    expect(await db.auditLog.count({ where: { action: "iam.account.auto_reactivate" } })).toBe(1);
  });

  it("keeps the account while another enrollment is open or the person is active staff", async () => {
    const s = await makeStudent();
    const userId = await provision(s);
    await end(s.enrollmentId);
    await db.enrollment.create({
      data: {
        studentId: s.studentId,
        programId,
        cohortId: cohort2Id,
        registrationType: "SECOND_PROGRAM",
        startedAt: new Date("2026-09-01T00:00:00Z"),
        status: "SUSPENDED",
      },
    });
    ok(await sync(s.personId));
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).active).toBe(true);

    await db.enrollment.updateMany({
      where: { studentId: s.studentId },
      data: { status: "DEREGISTERED" },
    });
    await db.staff.create({
      data: {
        personId: s.personId,
        kind: "ACADEMIC",
        category: "PAE",
        contractStart: new Date("2024-09-01T00:00:00Z"),
      },
    });
    ok(await sync(s.personId));
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).active).toBe(true);

    await db.staff.updateMany({ where: { personId: s.personId }, data: { active: false } });
    ok(await sync(s.personId));
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).active).toBe(false);
  });

  it("does nothing for a person without an account", async () => {
    const s = await makeStudent();
    await end(s.enrollmentId);
    ok(await sync(s.personId));
    expect(await db.auditLog.count()).toBe(0);
  });

  it("does not switch back on an account that a system administrator deactivated", async () => {
    const s = await makeStudent();
    const userId = await provision(s);
    await end(s.enrollmentId);
    ok(await sync(s.personId)); // off by the system
    // an administrator reactivates, then deactivates by hand
    await db.user.update({ where: { id: userId }, data: { active: true } });
    await db.auditLog.create({
      data: {
        actorType: "USER",
        actorUserId: actorId,
        action: "iam.user.deactivate",
        entityType: "User",
        entityId: userId,
        at: new Date(Date.now() + 1000),
      },
    });
    await db.user.update({ where: { id: userId }, data: { active: false } });
    await db.enrollment.create({
      data: {
        studentId: s.studentId,
        programId,
        cohortId: cohort2Id,
        registrationType: "SECOND_PROGRAM",
        startedAt: new Date("2026-09-01T00:00:00Z"),
      },
    });
    ok(await sync(s.personId));
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).active).toBe(false);
  });

  it("skips - and audits - a deactivation that would remove the last system administrator", async () => {
    const st = await makeStaff();
    const admin = await db.user.create({
      data: { email: "boss@logos.test", name: "Boss", personId: st.personId },
    });
    await db.userRole.create({
      data: { userId: admin.id, role: "sysadmin", scopeType: "INSTITUTION" },
    });
    await db.staff.update({ where: { id: st.staffId }, data: { active: false } });
    ok(await sync(st.personId));
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).active).toBe(true);
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "iam.account.sync_skipped" } }),
    ).toMatchObject({ entityId: admin.id, after: { skipped: "LAST_SYSADMIN" } });
  });
});

describe("provisionCohort (AC-10)", () => {
  it("creates missing accounts, reminds the pending ones and reports the skips", async () => {
    const fresh = await makeStudent();
    const noMail = await makeStudent({ email: null });
    const pending = await makeStudent();
    ok(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, pending.studentId)));
    const active = await makeStudent();
    const activeUser = ok(
      await run((ctx) => accounts.provisionStudentAccount(ctx, idp, active.studentId)),
    );
    await db.user.update({ where: { id: activeUser.userId }, data: { lastLoginAt: new Date() } });
    await makeStudent({ status: "GRADUATED" }); // not open: not part of the run
    idp.emails.length = 0;

    const out = ok(await run((ctx) => accounts.provisionCohort(ctx, idp, cohortId)));
    expect(out).toMatchObject({
      created: 1,
      reminded: 1,
      skipped: 2,
      reasons: { noEmail: 1, hasAccount: 1 },
    });
    expect(await db.user.count({ where: { personId: fresh.personId } })).toBe(1);
    expect(await db.user.count({ where: { personId: noMail.personId } })).toBe(0);
    expect(idp.emails).toHaveLength(2); // the new account and the reminder
  });

  it("aborts the whole run when the identity service is down", async () => {
    await makeStudent();
    idp.failWith = new IdentityProviderError("UNAVAILABLE", "down");
    expect(failure(await run((ctx) => accounts.provisionCohort(ctx, idp, cohortId))).code).toBe(
      "UNAVAILABLE",
    );
    expect(await db.user.count({ where: { personId: { not: null } } })).toBe(0);
  });
});

describe("neverActivatedTable (AC-11)", () => {
  const params = (filters: Record<string, string> = {}) => ({
    page: 1,
    pageSize: 50,
    sort: { key: "days", dir: "desc" as const },
    filters,
    columns: [],
  });

  it("lists never-signed-in accounts of the kinds the viewer may manage", async () => {
    const s = await makeStudent();
    const st = await makeStaff();
    const done = await makeStudent();
    ok(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, s.studentId)));
    ok(await run((ctx) => accounts.provisionStudentAccount(ctx, idp, done.studentId)));
    ok(
      await run((ctx) =>
        accounts.provisionStaffAccount(ctx, idp, { staffId: st.staffId, role: "lecturer" }),
      ),
    );
    await db.user.updateMany({
      where: { personId: done.personId },
      data: { lastLoginAt: new Date() },
    });

    const secretaryOnly = await db.user.create({ data: { email: "sec@t.test", name: "Sec" } });
    await db.userRole.create({
      data: { userId: secretaryOnly.id, role: "secretary", scopeType: "INSTITUTION" },
    });
    const hrOnly = await db.user.create({ data: { email: "hr@t.test", name: "Hr" } });
    await db.userRole.create({
      data: { userId: hrOnly.id, role: "hr", scopeType: "INSTITUTION" },
    });

    const forSecretary = await neverActivatedTable.fetch(params(), { user: secretaryOnly });
    expect(forSecretary.rows.map((r) => r.kind)).toEqual(["student"]);
    const forHr = await neverActivatedTable.fetch(params(), { user: hrOnly });
    expect(forHr.rows.map((r) => r.kind)).toEqual(["staff"]);
    expect(forHr.rows[0]!.href).toMatch(/^\/hr\/staff\//);

    const nobody = await db.user.create({ data: { email: "x@t.test", name: "X" } });
    expect((await neverActivatedTable.fetch(params(), { user: nobody })).total).toBe(0);
    const filtered = await neverActivatedTable.fetch(params({ kind: "staff" }), {
      user: secretaryOnly,
    });
    expect(filtered.total).toBe(0);
  });
});
