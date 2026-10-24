import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import "@/modules/cur";
import "@/modules/org";
import { registerEnrollmentOpenedHandler } from "@/modules/stu";
import "../permissions";
import { enrollManySchema, enrollSchema } from "../domain/enroll-schemas";
import { getEnrollDraft, listEnrollable, listEnrollPrograms } from "./enroll.queries";
import * as enrollment from "./enroll.service";

function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: "sec",
      email: "sec@t.test",
      name: "sec",
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "adm.application.enroll",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const fields = (r: ActionResult<unknown>) => (r.ok ? {} : (r.error.fieldErrors ?? {}));

let progId: string, otherProgId: string, cohortId: string, otherCohortId: string;
let groupId: string, otherGroupId: string, yearId: string, cycleId: string;
let seq = 0;

async function makeApp(over: Record<string, unknown> = {}) {
  seq++;
  return db.application.create({
    data: {
      reference: `AP-TEST${String(seq).padStart(4, "0")}`,
      cycleId,
      programId: progId,
      firstName: "Ana",
      lastName: `Hoxha${seq}`,
      gender: "FEMALE",
      birthDate: new Date("2007-03-14T00:00:00Z"),
      nationalId: `K0000${seq}A`,
      email: `ana${seq}@example.com`,
      emailKey: `ana${seq}@example.com`,
      phone: "+355 69 000 0000",
      address: "Rr. Kavajes 1",
      schoolName: "Gjimnazi",
      graduationYear: 2025,
      averageGrade: "9.25",
      consentAt: new Date(),
      tokenHash: `hash-${seq}`,
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      ...over,
    },
  });
}

const input = async (applicationId: string, over: Record<string, unknown> = {}) => {
  const draft = (await getEnrollDraft(applicationId))!;
  return enrollSchema.parse({
    applicationId,
    person: draft.person,
    registrationType: "FIRST_TIME",
    cohortId,
    groupId,
    startedAt: "2026-09-15",
    ...over,
  });
};
const enrollOne = async (applicationId: string, over: Record<string, unknown> = {}) =>
  run(async (ctx) => enrollment.enrollApplication(ctx, await input(applicationId, over)));

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "application_documents", "applications", "application_cycle_documents", "application_cycles", "stored_files", "year_registrations", "enrollment_status_events", "enrollments", "students", "student_groups", "cohorts", "curriculum_plans", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  await db.user.create({ data: { id: "sec", email: "sec@t.test", name: "sec" } });
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
  progId = await mkProg("P1");
  otherProgId = await mkProg("P2");
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
  const mkCohort = async (programId: string, name: string) => {
    const plan = await db.curriculumPlan.create({
      data: { programId, version: 1, validFromAcademicYearId: yearId, status: "APPROVED" },
    });
    return (
      await db.cohort.create({
        data: { programId, curriculumPlanId: plan.id, name, startAcademicYearId: yearId },
      })
    ).id;
  };
  cohortId = await mkCohort(progId, "2026");
  otherCohortId = await mkCohort(otherProgId, "p2");
  groupId = (
    await db.studentGroup.create({
      data: { cohortId, academicYearId: yearId, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  otherGroupId = (
    await db.studentGroup.create({
      data: { cohortId: otherCohortId, academicYearId: yearId, yearOfStudy: 1, name: "G2" },
    })
  ).id;
  cycleId = (
    await db.applicationCycle.create({
      data: {
        academicYearId: yearId,
        name: "Round 1",
        opensOn: new Date("2026-06-01T00:00:00Z"),
        closesOn: new Date("2026-09-15T00:00:00Z"),
        documents: {
          create: [
            { key: "diploma", labelSq: "Diploma", required: true, sequence: 1 },
            { key: "photo", labelSq: "Foto", required: false, sequence: 2 },
          ],
        },
      },
    })
  ).id;
  seq = 0;
});

describe("enrollApplication (AC-2)", () => {
  it("creates person, student, enrollment, year registration, link and audit", async () => {
    const app = await makeApp();
    const r = ok(await enrollOne(app.id, { allowMissingDocuments: true }));
    expect(r.studentNumber).toMatch(/^\d{6}$/);

    const student = await db.student.findUniqueOrThrow({
      where: { id: r.studentId },
      include: { person: true, enrollments: { include: { years: true, history: true } } },
    });
    expect(student.person).toMatchObject({ firstName: "Ana", email: "ana1@example.com" });
    const [en] = student.enrollments;
    expect(en).toMatchObject({ programId: progId, cohortId, registrationType: "FIRST_TIME" });
    expect(en!.years).toMatchObject([{ academicYearId: yearId, yearOfStudy: 1, groupId }]);
    expect(en!.history).toHaveLength(1);

    const after = await db.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after).toMatchObject({
      status: "ENROLLED",
      studentId: r.studentId,
      enrollmentId: r.enrollmentId,
      enrolledById: "sec",
      firstName: "Ana", // AC-10: submitted data untouched
    });
    expect(after.enrolledAt).not.toBeNull();

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "adm.application.enroll" },
    });
    expect(audit.entityId).toBe(app.id);
    expect(JSON.stringify(audit)).not.toContain("example.com");
    expect(audit.after).toMatchObject({ allowedMissingDocuments: true, existingStudent: false });
  });

  it("uses the corrected personal data as the confirmed ones", async () => {
    const app = await makeApp();
    const draft = (await getEnrollDraft(app.id))!;
    const r = ok(
      await run(async (ctx) =>
        enrollment.enrollApplication(
          ctx,
          enrollSchema.parse({
            applicationId: app.id,
            person: { ...draft.person, lastName: "Corrected", nim: "nim-9" },
            registrationType: "FIRST_TIME",
            cohortId,
            groupId,
            startedAt: "2026-09-15",
            allowMissingDocuments: true,
          }),
        ),
      ),
    );
    const s = await db.student.findUniqueOrThrow({
      where: { id: r.studentId },
      include: { person: true },
    });
    expect(s.person.lastName).toBe("Corrected");
    expect(s.nim).toBe("NIM-9");
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).lastName).toBe(
      "Hoxha1",
    );
  });

  it("runs the enrollment-opened handlers and creates no payment plan (AC-6)", async () => {
    const seen: string[] = [];
    registerEnrollmentOpenedHandler("adm04-test", async (_c, e) => {
      seen.push(e.enrollmentId);
    });
    const app = await makeApp();
    const r = ok(await enrollOne(app.id, { allowMissingDocuments: true }));
    expect(seen).toEqual([r.enrollmentId]);
    expect(await db.paymentPlan.count()).toBe(0);
    registerEnrollmentOpenedHandler("adm04-test", async () => {});
  });
});

describe("refusals (AC-3, AC-5)", () => {
  it("refuses an enrolled, rejected or unknown application", async () => {
    const app = await makeApp();
    ok(await enrollOne(app.id, { allowMissingDocuments: true }));
    const again = await enrollOne(app.id, { allowMissingDocuments: true });
    expect(!again.ok && again.error.message).toBe("alreadyEnrolled");
    const rejected = await makeApp({ status: "REJECTED" });
    const r = await enrollOne(rejected.id, { allowMissingDocuments: true });
    expect(!r.ok && r.error.message).toBe("notEnrollable");
    const gone = await run((ctx) =>
      enrollment.enrollApplication(ctx, {
        applicationId: "nope",
        person: {},
        registrationType: "FIRST_TIME",
        cohortId,
        groupId,
        startedAt: "2026-09-15",
        allowMissingDocuments: true,
      }),
    );
    expect(!gone.ok && gone.error.code).toBe("NOT_FOUND");
    expect(await db.student.count()).toBe(1);
  });

  it("refuses a missing required document unless the officer allows it", async () => {
    const app = await makeApp();
    const r = await enrollOne(app.id);
    expect(!r.ok && r.error.message).toBe("documentsMissing");
    expect(await db.student.count()).toBe(0);
    ok(await enrollOne(app.id, { allowMissingDocuments: true }));
  });

  it("accepts the application when the required document is there", async () => {
    const app = await makeApp({ status: "ACCEPTED" });
    const file = await db.storedFile.create({
      data: {
        purpose: "application-document",
        fileName: "d.pdf",
        mimeType: "application/pdf",
        size: 3,
        storageKey: "2026/10/k1",
        sha256: "x",
        uploadedById: "sec",
      },
    });
    await db.applicationDocument.create({
      data: { applicationId: app.id, documentKey: "diploma", fileId: file.id },
    });
    ok(await enrollOne(app.id));
  });

  it("refuses a cohort of another program and a group of another cohort, changing nothing", async () => {
    const app = await makeApp();
    const wrongCohort = await enrollOne(app.id, {
      allowMissingDocuments: true,
      cohortId: otherCohortId,
      groupId: otherGroupId,
    });
    expect(fields(wrongCohort).cohortId).toEqual(["cohortMismatch"]);
    const wrongGroup = await enrollOne(app.id, {
      allowMissingDocuments: true,
      groupId: otherGroupId,
    });
    expect(fields(wrongGroup).groupId).toEqual(["groupMismatch"]);
    expect(await db.student.count()).toBe(0);
    expect(await db.person.count()).toBe(0);
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(
      "SUBMITTED",
    );
  });

  it("refuses invalid personal data and a NIM already used", async () => {
    const a = await makeApp();
    const b = await makeApp();
    ok(
      await run(async (ctx) =>
        enrollment.enrollApplication(
          ctx,
          await input(a.id, {
            allowMissingDocuments: true,
            person: { ...(await getEnrollDraft(a.id))!.person, nim: "N1" },
          }),
        ),
      ),
    );
    const clash = await run(async (ctx) =>
      enrollment.enrollApplication(
        ctx,
        await input(b.id, {
          allowMissingDocuments: true,
          person: { ...(await getEnrollDraft(b.id))!.person, nim: "n1" },
        }),
      ),
    );
    expect(fields(clash).nim).toEqual(["nimTaken"]);
    const bad = await run(async (ctx) =>
      enrollment.enrollApplication(
        ctx,
        await input(b.id, {
          allowMissingDocuments: true,
          person: { ...(await getEnrollDraft(b.id))!.person, email: "not-an-email" },
        }),
      ),
    );
    expect(fields(bad).email).toEqual(["invalidEmail"]);
  });
});

describe("a person who already is a student (AC-4)", () => {
  it("adds an enrollment to the existing student without overwriting their data", async () => {
    const first = await makeApp({
      nationalId: "K11111111A",
      email: "same@example.com",
      emailKey: "same@example.com",
    });
    const r1 = ok(await enrollOne(first.id, { allowMissingDocuments: true }));
    // the same person applies to the other program
    const second = await makeApp({
      programId: otherProgId,
      nationalId: "K11111111A",
      email: "same@example.com",
      emailKey: "same@example.com",
      firstName: "Changed",
    });
    const refused = await run(async (ctx) =>
      enrollment.enrollApplication(
        ctx,
        await input(second.id, {
          allowMissingDocuments: true,
          cohortId: otherCohortId,
          groupId: otherGroupId,
        }),
      ),
    );
    expect(fields(refused).registrationType).toEqual(["firstTimeKnown"]);
    const r2 = ok(
      await run(async (ctx) =>
        enrollment.enrollApplication(
          ctx,
          await input(second.id, {
            allowMissingDocuments: true,
            cohortId: otherCohortId,
            groupId: otherGroupId,
            registrationType: "SECOND_PROGRAM",
          }),
        ),
      ),
    );
    expect(r2.studentId).toBe(r1.studentId);
    expect(await db.student.count()).toBe(1);
    expect(await db.enrollment.count({ where: { studentId: r1.studentId } })).toBe(2);
    const person = await db.person.findFirstOrThrow({});
    expect(person.firstName).toBe("Ana");
  });
});

describe("enrollMany (AC-7)", () => {
  const many = (ids: string[], over: Record<string, unknown> = {}) =>
    enrollManySchema.parse({
      applicationIds: ids,
      registrationType: "FIRST_TIME",
      cohortId,
      groupId,
      startedAt: "2026-09-15",
      allowMissingDocuments: true,
      ...over,
    });

  it("enrolls the good candidates and reports the one that fails, alone", async () => {
    const a = await makeApp();
    const b = await makeApp({ programId: otherProgId }); // wrong program for this cohort
    const c = await makeApp();
    const r = ok(await run((ctx) => enrollment.enrollMany(ctx, many([a.id, b.id, c.id]))));
    expect(r).toMatchObject({ enrolled: 2, failed: 1 });
    expect(r.items.find((i) => !i.ok)).toMatchObject({
      reference: b.reference,
      code: "cohortMismatch",
    });
    expect(await db.student.count()).toBe(2);
    expect(await db.application.count({ where: { status: "ENROLLED" } })).toBe(2);
    expect((await db.application.findUniqueOrThrow({ where: { id: b.id } })).status).toBe(
      "SUBMITTED",
    );
    expect(await db.auditLog.count({ where: { action: "adm.application.enroll" } })).toBe(2);
  });

  it("isolates a data conflict between two candidates who are the same person", async () => {
    const a = await makeApp({ nationalId: "K99999999A" });
    const b = await makeApp({ nationalId: "K99999999A" });
    const r = ok(await run((ctx) => enrollment.enrollMany(ctx, many([a.id, b.id]))));
    expect(r.enrolled).toBe(1);
    expect(r.items[1]).toMatchObject({ ok: false, code: "firstTimeKnown" });
    expect(await db.student.count()).toBe(1);
  });

  it("rejects more than 100 ids and duplicates in the schema", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);
    expect(enrollManySchema.safeParse({ ...many(["x"]), applicationIds: ids }).success).toBe(false);
    expect(enrollManySchema.safeParse({ ...many(["x"]), applicationIds: ["x", "x"] }).success).toBe(
      false,
    );
  });
});

describe("queries and permissions (AC-1, AC-8)", () => {
  it("lists enrollable applications per program and drops enrolled and rejected ones", async () => {
    const a = await makeApp();
    await makeApp({ status: "REJECTED" });
    await makeApp({ programId: otherProgId });
    const done = await makeApp();
    ok(await enrollOne(done.id, { allowMissingDocuments: true }));
    const rows = await listEnrollable(progId);
    expect(rows.map((r) => r.id)).toEqual([a.id]);
    expect(rows[0]!.missing).toBe(1);
    const programs = await listEnrollPrograms();
    expect(programs.map((p) => [p.id, p.waiting])).toEqual([
      [progId, 1],
      [otherProgId, 1],
    ]);
  });

  it("is granted to the Secretariat and Student Affairs only", async () => {
    const mk = async (id: string, role: string) => {
      await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
      await db.userRole.create({
        data: { userId: id, role: role as never, scopeType: "INSTITUTION" },
      });
      return { id, email: `${id}@t.test`, name: id, locale: null, personId: null };
    };
    for (const [role, expected] of [
      ["secretary", true],
      ["student_affairs", true],
      ["finance", false],
      ["sysadmin", false],
      ["lecturer", false],
      ["student", false],
    ] as const) {
      const user = await mk(`u-${role}`, role);
      expect(await can(user, "adm.application.enroll")).toBe(expected);
    }
  });
});
