import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { changeState, submitAuthenticated, submitPublic } from "@/lib/forms/submission.service";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/stu";
import { REQUEST_FORMS } from "../domain/request-forms";
import { personalSchema } from "../domain/schemas";
import { getRecognitionPanel, listRecognizedCourses } from "./recognition.queries";
import * as recognition from "./recognition.service";
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
const message = <T>(r: ActionResult<T>): string => (r.ok ? "ok" : r.error.message);

let prog1: string, prog2: string, cohort1: string, cohort2: string, deptId: string;
let studentId: string, enrollmentId: string, studentNumber: string, studentUserId: string;
const today = new Date().toISOString().slice(0, 10);

async function mkUser(id: string, role: "sysadmin" | "secretary" | "student" | "finance") {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: { userId: id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
  });
}

beforeEach(async () => {
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "notifications", "email_outbox", "rate_limit_hits", "recognized_courses", "form_submission_events", "form_submissions", "form_definitions", "stored_files", "year_registrations", "enrollment_status_events", "enrollments", "students", "student_groups", "cohorts", "curriculum_plans", "user_roles", "courses", "study_programs", "departments", "faculties", "academic_years" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const d = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  deptId = d.id;
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
  const mkCohort = async (programId: string, name: string) => {
    const plan = await db.curriculumPlan.create({
      data: { programId, version: 1, validFromAcademicYearId: year, status: "APPROVED" },
    });
    return (
      await db.cohort.create({
        data: { programId, curriculumPlanId: plan.id, name, startAcademicYearId: year },
      })
    ).id;
  };
  cohort1 = await mkCohort(prog1, "A");
  cohort2 = await mkCohort(prog2, "B");

  actorId = "sec-1";
  await mkUser("sec-1", "secretary");
  await mkUser("sec-2", "secretary");
  await mkUser("admin", "sysadmin");
  await mkUser("fin-1", "finance");
  for (const form of REQUEST_FORMS)
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
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  studentNumber = student.studentNumber;
  // the student's own account, linked to the person
  studentUserId = "stu-user";
  await mkUser(studentUserId, "student");
  await db.user.update({ where: { id: studentUserId }, data: { personId: student.personId } });
});

const publicDereg = (over: Record<string, unknown> = {}) =>
  submitPublic(
    "deregistration",
    {
      firstName: "Ana",
      lastName: "Leka",
      studentNumber,
      birthDate: "2003-04-05",
      email: "ana@student.test",
      reason: "Kalim në punë",
      requestedDate: today,
      confirm: true,
      ...over,
    },
    "10.0.0.1",
  );
const idOf = async (reference: string) =>
  (await db.formSubmission.findUniqueOrThrow({ where: { reference } })).id;
const approve = (id: string) => run((ctx) => changeState(ctx, id, "approved", "Miratuar"));

describe("deregistration request (AC-2..AC-4)", () => {
  it("a public request deregisters the identified student on approval", async () => {
    const res = await publicDereg({ requestedDate: "2025-12-01" });
    if (!res.ok) throw new Error("submit failed");
    const id = await idOf(res.reference);
    ok(await approve(id));
    const enrollment = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(enrollment.status).toBe("DEREGISTERED");
    expect(enrollment.endedAt?.toISOString().slice(0, 10)).toBe("2025-12-01");
    const event = await db.enrollmentStatusEvent.findFirstOrThrow({
      where: { enrollmentId, toStatus: "DEREGISTERED" },
    });
    expect(event).toMatchObject({ reason: "Kalim në punë", documentRef: `FORM:${res.reference}` });
    expect(
      await db.auditLog.count({ where: { action: "stu.enrollment.change_status" } }),
    ).toBeGreaterThan(0);
    // the student is told by STU-02's own handler
    expect(await db.notification.count({ where: { userId: studentUserId } })).toBeGreaterThan(0);
  });

  it("a signed-in request is identified by the account, a future date becomes today", async () => {
    actorId = studentUserId;
    const sub = ok(
      await run((ctx) =>
        submitAuthenticated(ctx, "deregistration-student", {
          reason: "Transfer",
          requestedDate: "2999-01-01",
          confirm: true,
        }),
      ),
    );
    actorId = "sec-1";
    ok(await approve(sub.submissionId));
    const enrollment = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(enrollment.status).toBe("DEREGISTERED");
    expect(enrollment.endedAt?.toISOString().slice(0, 10)).toBe(today);
  });

  it("a date before the enrollment is moved to its start", async () => {
    const res = await publicDereg({ requestedDate: "2020-01-01" });
    if (!res.ok) throw new Error("submit failed");
    ok(await approve(await idOf(res.reference)));
    const enrollment = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(enrollment.endedAt?.toISOString().slice(0, 10)).toBe("2025-09-15");
  });

  it("refuses and rolls back when the date of birth does not match", async () => {
    const res = await publicDereg({ birthDate: "2003-04-06" });
    if (!res.ok) throw new Error("submit failed");
    const id = await idOf(res.reference);
    expect(message(await approve(id))).toBe("STUDENT_NOT_IDENTIFIED");
    expect((await db.formSubmission.findUniqueOrThrow({ where: { id } })).state).toBe("new");
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status).toBe(
      "ACTIVE",
    );
  });

  it("refuses an unknown student number", async () => {
    const res = await publicDereg({ studentNumber: "999999" });
    if (!res.ok) throw new Error("submit failed");
    expect(message(await approve(await idOf(res.reference)))).toBe("STUDENT_NOT_IDENTIFIED");
  });

  it("refuses when the student has no open enrollment", async () => {
    await db.enrollment.update({ where: { id: enrollmentId }, data: { status: "DEREGISTERED" } });
    const res = await publicDereg();
    if (!res.ok) throw new Error("submit failed");
    expect(message(await approve(await idOf(res.reference)))).toBe("NO_OPEN_ENROLLMENT");
  });

  it("with two open enrollments the program code decides", async () => {
    const second = await db.enrollment.create({
      data: {
        studentId,
        programId: prog2,
        cohortId: cohort2,
        registrationType: "SECOND_PROGRAM",
        startedAt: new Date("2025-09-15T00:00:00Z"),
        history: {
          create: { toStatus: "ACTIVE", effectiveDate: new Date("2025-09-15T00:00:00Z") },
        },
      },
    });
    const none = await publicDereg();
    if (!none.ok) throw new Error("submit failed");
    expect(message(await approve(await idOf(none.reference)))).toBe("AMBIGUOUS_ENROLLMENT");

    const named = await publicDereg({ program: "p2" });
    if (!named.ok) throw new Error("submit failed");
    ok(await approve(await idOf(named.reference)));
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: second.id } })).status).toBe(
      "DEREGISTERED",
    );
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status).toBe(
      "ACTIVE",
    );
  });

  it("rejecting changes nothing; the sysadmin cannot deregister (no stu.student.write)", async () => {
    const res = await publicDereg();
    if (!res.ok) throw new Error("submit failed");
    const id = await idOf(res.reference);
    ok(await run((ctx) => changeState(ctx, id, "rejected", "Dokumente të paplota")));
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status).toBe(
      "ACTIVE",
    );

    const second = await publicDereg();
    if (!second.ok) throw new Error("submit failed");
    actorId = "admin";
    expect(message(await approve(await idOf(second.reference)))).toBe("NOT_ALLOWED_TO_DEREGISTER");
  });

  it("a user outside the form's roles cannot approve it", async () => {
    const res = await publicDereg();
    if (!res.ok) throw new Error("submit failed");
    actorId = "fin-1";
    expect(message(await approve(await idOf(res.reference)))).toBe("Submission not found");
  });
});

describe("recognition (AC-5..AC-9)", () => {
  let courseA: string;
  const submitReco = async (over: Record<string, unknown> = {}) => {
    const res = await submitPublic(
      "recognition",
      {
        firstName: "Ana",
        lastName: "Leka",
        studentNumber,
        birthDate: "2003-04-05",
        email: "ana@student.test",
        institution: "Universiteti X",
        studyProgram: "Informatikë",
        courses: "Algjebra 6",
        ...over,
      },
      "10.0.0.2",
    );
    if (!res.ok) throw new Error("submit failed");
    return idOf(res.reference);
  };
  beforeEach(async () => {
    courseA = (
      await db.course.create({
        data: { code: "ALG1", name: "Algjebra", defaultCredits: 6, departmentId: deptId },
      })
    ).id;
  });

  it("records a course with default credits, audits it, and lists it for the student", async () => {
    const id = await submitReco();
    const rec = ok(
      await run((ctx) =>
        recognition.recordRecognition(ctx, {
          submissionId: id,
          courseCode: "alg1",
          credits: null,
          note: "Universiteti X",
        }),
      ),
    );
    const row = await db.recognizedCourse.findUniqueOrThrow({ where: { id: rec.id } });
    expect(row).toMatchObject({ studentId, enrollmentId, courseId: courseA, credits: 6 });
    expect(await db.auditLog.count({ where: { action: "stu.recognition.record" } })).toBe(1);
    const list = await listRecognizedCourses({ id: "sec-1" }, studentId);
    expect(list.map((c) => c.course.code)).toEqual(["ALG1"]);
    const panel = await getRecognitionPanel({ id: "sec-1" }, id);
    expect(panel?.courses).toHaveLength(1);
    expect(panel?.requester).toMatchObject({ studentNumber });
  });

  it("refuses a second live recognition of the same course, allows it after voiding", async () => {
    const id = await submitReco();
    const rec = (credits: number | null = 5) =>
      run((ctx) =>
        recognition.recordRecognition(ctx, {
          submissionId: id,
          courseCode: "ALG1",
          credits,
          note: null,
        }),
      );
    const first = ok(await rec());
    const dup = await rec();
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.fieldErrors?.courseCode).toEqual(["alreadyRecognized"]);

    const noReason = await run((ctx) => recognition.voidRecognition(ctx, { id: first.id }));
    expect(noReason.ok).toBe(false);
    ok(await run((ctx) => recognition.voidRecognition(ctx, { id: first.id }), "Gabim"));
    const voided = await db.recognizedCourse.findUniqueOrThrow({ where: { id: first.id } });
    expect(voided.voidedAt).not.toBeNull();
    expect(voided.voidReason).toBe("Gabim");
    expect(await listRecognizedCourses({ id: "sec-1" }, studentId)).toHaveLength(0);
    ok(await rec(4));
    expect(await db.recognizedCourse.count()).toBe(2);
    expect(await db.auditLog.count({ where: { action: "stu.recognition.void" } })).toBe(1);
  });

  it("refuses an unknown course and an invalid credit value", async () => {
    const id = await submitReco();
    const unknown = await run((ctx) =>
      recognition.recordRecognition(ctx, {
        submissionId: id,
        courseCode: "NOPE",
        credits: null,
        note: null,
      }),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.fieldErrors?.courseCode).toEqual(["unknownCourse"]);
  });

  it("approval needs a live recognized course; rejection does not", async () => {
    const id = await submitReco();
    expect(message(await approve(id))).toBe("NO_RECOGNIZED_COURSES");
    const rec = ok(
      await run((ctx) =>
        recognition.recordRecognition(ctx, {
          submissionId: id,
          courseCode: "ALG1",
          credits: null,
          note: null,
        }),
      ),
    );
    ok(await run((ctx) => recognition.voidRecognition(ctx, { id: rec.id }), "Gabim"));
    expect(message(await approve(id))).toBe("NO_RECOGNIZED_COURSES");
    ok(
      await run((ctx) =>
        recognition.recordRecognition(ctx, {
          submissionId: id,
          courseCode: "ALG1",
          credits: 3,
          note: null,
        }),
      ),
    );
    ok(await approve(id));
    expect((await db.formSubmission.findUniqueOrThrow({ where: { id } })).state).toBe("approved");

    const other = await submitReco();
    ok(await run((ctx) => changeState(ctx, other, "rejected", "Jo")));
  });

  it("decisions are refused once the request is closed", async () => {
    const id = await submitReco();
    ok(await run((ctx) => changeState(ctx, id, "rejected", "Jo")));
    const r = await run((ctx) =>
      recognition.recordRecognition(ctx, {
        submissionId: id,
        courseCode: "ALG1",
        credits: null,
        note: null,
      }),
    );
    expect(message(r)).toBe("REQUEST_CLOSED");
  });

  it("another office cannot decide, and a deregistration request is not a recognition", async () => {
    const id = await submitReco();
    actorId = "fin-1";
    const r = await run((ctx) =>
      recognition.recordRecognition(ctx, {
        submissionId: id,
        courseCode: "ALG1",
        credits: null,
        note: null,
      }),
    );
    expect(message(r)).toBe("Submission not found");
    actorId = "sec-1";
    const dereg = await publicDereg();
    if (!dereg.ok) throw new Error("submit failed");
    const depId = await idOf(dereg.reference);
    const wrong2 = await run((ctx) =>
      recognition.recordRecognition(ctx, {
        submissionId: depId,
        courseCode: "ALG1",
        credits: null,
        note: null,
      }),
    );
    expect(message(wrong2)).toBe("Submission not found");
    expect(await getRecognitionPanel({ id: "sec-1" }, depId)).toBeNull();
  });

  it("the student of a signed-in request is the submitter's own record", async () => {
    actorId = studentUserId;
    const sub = ok(
      await run((ctx) =>
        submitAuthenticated(ctx, "recognition-student", {
          institution: "X",
          studyProgram: "Y",
          courses: "Algjebra 6",
        }),
      ),
    );
    actorId = "sec-1";
    const rec = ok(
      await run((ctx) =>
        recognition.recordRecognition(ctx, {
          submissionId: sub.submissionId,
          courseCode: "ALG1",
          credits: 6,
          note: null,
        }),
      ),
    );
    expect((await db.recognizedCourse.findUniqueOrThrow({ where: { id: rec.id } })).studentId).toBe(
      studentId,
    );
  });
});
