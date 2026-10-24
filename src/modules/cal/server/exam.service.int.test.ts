import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/hr";
import "@/modules/cal";
import { feedExams, listSessions, myExams, sessionSittings } from "./exam.queries";
import * as svc from "./exam.service";

const actor = { id: "sec-1", email: "s@t.test", name: "Sec", locale: null, personId: null };
function runAs<R>(
  user: typeof actor,
  fn: (ctx: ActionContext) => Promise<R>,
  allow: (() => Promise<boolean>) | null = async () => true,
): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => user,
    can: allow ?? ((u, p) => can(u, p)),
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "cal.exam.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const run = <R>(fn: (ctx: ActionContext) => Promise<R>) => runAs(actor, fn);
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let year: string, closedYear: string;
let prog1: string, prog2: string;
let pcA1: string, pcB1: string, pcY3: string, pcP2: string; // plan courses
let staff1: string, staff2: string, staff3: string;
let winter: string, mini: string;

const sittingBody = (planCourseId: string, over: Record<string, unknown> = {}) => ({
  sessionId: winter,
  planCourseId,
  date: "2027-01-12",
  startMinute: 540,
  endMinute: 660,
  room: "A1",
  note: null,
  examinerIds: [] as string[],
  ...over,
});
const addSitting = (planCourseId: string, over: Record<string, unknown> = {}) =>
  run((ctx) => svc.createSitting(ctx, sittingBody(planCourseId, over) as never));

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "exam_sitting_examiners", "exam_sittings", "exam_sessions", "teaching_assignments", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "staff", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const d = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  const mkProg = async (code: string, years: number) =>
    (
      await db.studyProgram.create({
        data: {
          departmentId: d.id,
          cycle: "FIRST",
          code,
          name: code,
          durationYears: years,
          totalCredits: years * 60,
        },
      })
    ).id;
  prog1 = await mkProg("P1", 3);
  prog2 = await mkProg("P2", 2);
  const mkYear = (code: string, start: string, status: "CURRENT" | "CLOSED") =>
    db.academicYear
      .create({
        data: {
          code,
          startDate: new Date(`${start}-09-01T00:00:00Z`),
          endDate: new Date(`${Number(start) + 1}-08-31T00:00:00Z`),
          status,
        },
      })
      .then((y) => y.id);
  closedYear = await mkYear("2024-2025", "2024", "CLOSED");
  year = await mkYear("2026-2027", "2026", "CURRENT");
  const mkPlan = async (programId: string) =>
    (
      await db.curriculumPlan.create({
        data: { programId, version: 1, validFromAcademicYearId: year, status: "DRAFT" },
      })
    ).id;
  const plan1 = await mkPlan(prog1);
  const plan2 = await mkPlan(prog2);
  const course = async (code: string) =>
    (await db.course.create({ data: { code, name: code, defaultCredits: 6, departmentId: d.id } }))
      .id;
  const pc = async (planId: string, code: string, yearOfStudy: number) =>
    (
      await db.planCourse.create({
        data: { planId, courseId: await course(code), yearOfStudy, semester: 1, credits: 6 },
      })
    ).id;
  pcA1 = await pc(plan1, "CA", 1);
  pcB1 = await pc(plan1, "CB", 1);
  pcY3 = await pc(plan1, "CY3", 3);
  pcP2 = await pc(plan2, "CP2", 1);
  await db.curriculumPlan.updateMany({ data: { status: "APPROVED" } });
  const cohort = async (programId: string, planId: string) =>
    (
      await db.cohort.create({
        data: { programId, startAcademicYearId: year, curriculumPlanId: planId, name: "C" },
      })
    ).id;
  const c1 = await cohort(prog1, plan1);
  const c2 = await cohort(prog2, plan2);
  await db.studentGroup.create({
    data: { cohortId: c1, academicYearId: year, yearOfStudy: 1, name: "G1" },
  });
  await db.studentGroup.create({
    data: { cohortId: c2, academicYearId: year, yearOfStudy: 1, name: "G1" },
  });
  const staffOf = async (n: string) => {
    const p = await db.person.create({
      data: {
        firstName: n,
        lastName: "L",
        gender: "MALE",
        birthDate: new Date("1980-01-01T00:00:00Z"),
        email: `${n}@t.test`,
      },
    });
    const s = await db.staff.create({
      data: {
        personId: p.id,
        kind: "ACADEMIC",
        category: "PAE",
        contractStart: new Date("2020-01-01T00:00:00Z"),
      },
    });
    await db.user.create({ data: { id: n, email: `${n}@t.test`, name: n, personId: p.id } });
    return s.id;
  };
  staff1 = await staffOf("lec1");
  staff2 = await staffOf("lec2");
  staff3 = await staffOf("lec3");
  winter = ok(
    await run((ctx) =>
      svc.createSession(ctx, {
        academicYearId: year,
        type: "WINTER",
        startDate: "2027-01-11",
        endDate: "2027-02-05",
      }),
    ),
  ).sessionId;
  mini = ok(
    await run((ctx) =>
      svc.createSession(ctx, {
        academicYearId: year,
        type: "MINI",
        startDate: "2027-02-08",
        endDate: "2027-02-19",
      }),
    ),
  ).sessionId;
});

describe("sessions (AC-1, AC-6, AC-7)", () => {
  it("creates sessions with audit, one per type and year", async () => {
    expect((await listSessions(year)).map((s) => s.type)).toEqual(["WINTER", "MINI"]);
    expect(await db.auditLog.count({ where: { action: "cal.exam_session.create" } })).toBe(2);
    const again = await run((ctx) =>
      svc.createSession(ctx, {
        academicYearId: year,
        type: "WINTER",
        startDate: "2027-01-11",
        endDate: "2027-01-20",
      }),
    );
    expect(again).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("refuses bad dates, dates outside the year and closed years", async () => {
    for (const [startDate, endDate] of [
      ["2027-02-05", "2027-01-11"],
      ["2026-08-01", "2026-09-10"],
      ["2027-08-01", "2027-09-10"],
    ] as [string, string][])
      expect(
        await run((ctx) =>
          svc.createSession(ctx, { academicYearId: year, type: "AUTUMN", startDate, endDate }),
        ),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await run((ctx) =>
        svc.createSession(ctx, {
          academicYearId: closedYear,
          type: "WINTER",
          startDate: "2025-01-10",
          endDate: "2025-01-20",
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("changes dates unless a sitting would fall outside, and audits", async () => {
    ok(await addSitting(pcA1, { date: "2027-02-02" }));
    const shrink = await run((ctx) =>
      svc.updateSession(ctx, winter, { startDate: "2027-01-11", endDate: "2027-01-31" }),
    );
    expect(shrink).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    ok(
      await run((ctx) =>
        svc.updateSession(ctx, winter, { startDate: "2027-01-05", endDate: "2027-02-10" }),
      ),
    );
    expect((await listSessions(year))[0]).toMatchObject({
      startDate: "2027-01-05",
      endDate: "2027-02-10",
    });
    expect(await db.auditLog.count({ where: { action: "cal.exam_session.update" } })).toBe(1);
  });

  it("publishes and unpublishes with audit", async () => {
    ok(await run((ctx) => svc.setPublished(ctx, winter, true)));
    expect((await listSessions(year))[0]!.published).toBe(true);
    ok(await run((ctx) => svc.setPublished(ctx, winter, false)));
    expect((await listSessions(year))[0]!.published).toBe(false);
    expect(await db.auditLog.count({ where: { action: "cal.exam_session.publish" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "cal.exam_session.unpublish" } })).toBe(1);
  });
});

describe("sittings (AC-2..AC-6)", () => {
  it("creates a sitting with examiners and audits", async () => {
    const { sittingId } = ok(await addSitting(pcA1, { examinerIds: [staff1, staff2] }));
    const [s] = await sessionSittings(winter);
    expect(s).toMatchObject({ id: sittingId, courseCode: "CA", date: "2027-01-12", room: "A1" });
    expect(s!.examiners).toHaveLength(2);
    expect(await db.auditLog.count({ where: { action: "cal.exam_sitting.create" } })).toBe(1);
  });

  it("refuses a second sitting of the same course in a session", async () => {
    ok(await addSitting(pcA1));
    expect(await addSitting(pcA1, { date: "2027-01-14" })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("refuses dates outside the session, bad times, unknown examiners and too many examiners", async () => {
    for (const over of [
      { date: "2027-02-06" },
      { date: "2027-01-10" },
      { startMinute: 700, endMinute: 700 },
      { room: "x".repeat(51) },
      { examinerIds: ["nope"] },
      { examinerIds: [staff1, staff1] },
      { examinerIds: Array.from({ length: 7 }, (_, i) => `s${i}`) },
    ])
      expect(await addSitting(pcA1, over)).toMatchObject({ ok: false });
    expect(await db.examSitting.count()).toBe(0);
  });

  it("the mini-session takes only final-year courses (SRC-052)", async () => {
    const m = (pc: string) => addSitting(pc, { sessionId: mini, date: "2027-02-09" });
    expect(await m(pcA1)).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await m(pcY3)).toMatchObject({ ok: true }); // 3rd year of a 3-year bachelor
    expect(await addSitting(pcP2, { sessionId: mini, date: "2027-02-10" })).toMatchObject({
      ok: false, // year 1 of a 2-year master is not final
    });
  });

  it("refuses clashes of group, examiner and room, naming them; allows disjoint ones", async () => {
    ok(await addSitting(pcA1, { examinerIds: [staff1] }));
    const group = await addSitting(pcB1, { room: "B2", startMinute: 600, endMinute: 700 });
    expect(group).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (!group.ok) expect(group.error.message).toMatch(/^CLASH:GROUP:CA/);
    const examiner = await addSitting(pcP2, { room: "B2", examinerIds: [staff1] });
    if (!examiner.ok) expect(examiner.error.message).toContain("EXAMINER");
    expect(examiner.ok).toBe(false);
    const room = await addSitting(pcP2, { room: " a1 " });
    if (!room.ok) expect(room.error.message).toContain("ROOM");
    expect(room.ok).toBe(false);
    // another plan, room and examiner at the same time; touching times; another day
    expect((await addSitting(pcP2, { room: "B2", examinerIds: [staff2] })).ok).toBe(true);
    expect((await addSitting(pcB1, { startMinute: 660, endMinute: 720 })).ok).toBe(true);
    expect((await addSitting(pcY3, { date: "2027-01-13" })).ok).toBe(true);
    expect(await db.examSitting.count()).toBe(4);
  });

  it("rechecks on change, ignoring itself, replaces examiners, and removes with audit", async () => {
    const { sittingId } = ok(await addSitting(pcA1, { examinerIds: [staff1] }));
    const other = ok(await addSitting(pcB1, { date: "2027-01-13", room: "B2" })).sittingId;
    const body = (over: Record<string, unknown>) => ({
      date: "2027-01-12",
      startMinute: 560,
      endMinute: 620,
      room: "A1",
      note: "n",
      examinerIds: [staff3],
      ...over,
    });
    ok(await run((ctx) => svc.updateSitting(ctx, sittingId, body({}) as never)));
    expect((await sessionSittings(winter)).find((s) => s.id === sittingId)!.examiners).toHaveLength(
      1,
    );
    // moving the other onto the first one's day clashes (same plan and year of study)
    expect(
      await run((ctx) => svc.updateSitting(ctx, other, body({ room: "B2" }) as never)),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await db.auditLog.count({ where: { action: "cal.exam_sitting.update" } })).toBe(1);
    ok(await run((ctx) => svc.removeSitting(ctx, sittingId)));
    expect(await db.examSitting.count()).toBe(1);
    expect(await db.examSittingExaminer.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "cal.exam_sitting.remove" } })).toBe(1);
    expect(await run((ctx) => svc.removeSitting(ctx, "nope"))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("permissions (AC-10)", () => {
  it("lecturers and students cannot write; the Secretariat can", async () => {
    await db.userRole.create({
      data: { userId: "lec1", role: "lecturer", scopeType: "INSTITUTION" },
    });
    await db.userRole.create({
      data: { userId: "lec2", role: "secretary", scopeType: "INSTITUTION" },
    });
    const users = (id: string) => ({ ...actor, id });
    const probe = (id: string) =>
      runAs(users(id), (ctx) => svc.setPublished(ctx, winter, true), null);
    expect(await probe("lec1")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await probe("lec3")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await probe("lec2")).ok).toBe(true);
  });
});

describe("visibility (AC-7..AC-9)", () => {
  async function student() {
    const sp = await db.person.create({
      data: {
        firstName: "St",
        lastName: "U",
        gender: "FEMALE",
        birthDate: new Date("2003-01-01T00:00:00Z"),
      },
    });
    const st = await db.student.create({ data: { personId: sp.id } });
    const cohort = await db.cohort.findFirstOrThrow({ where: { programId: prog1 } });
    const group = await db.studentGroup.findFirstOrThrow({ where: { cohortId: cohort.id } });
    const en = await db.enrollment.create({
      data: {
        studentId: st.id,
        programId: prog1,
        cohortId: cohort.id,
        registrationType: "FIRST_TIME",
        startedAt: new Date("2026-09-15T00:00:00Z"),
      },
    });
    await db.yearRegistration.create({
      data: { enrollmentId: en.id, academicYearId: year, yearOfStudy: 1, groupId: group.id },
    });
    await db.user.create({
      data: { id: "stu", email: "stu@t.test", name: "stu", personId: sp.id },
    });
    return en.id;
  }

  it("a student sees only published exams of their plan and year; a lecturer those they examine", async () => {
    const enrollment = await student();
    ok(await addSitting(pcA1, { examinerIds: [staff1] }));
    ok(await addSitting(pcP2, { date: "2027-01-13", examinerIds: [staff2], room: "B2" })); // other plan
    ok(await addSitting(pcY3, { sessionId: mini, date: "2027-02-09" })); // other year of study

    // drafts are hidden from students and lecturers
    expect(await myExams("stu", year)).toEqual([]);
    expect(await myExams("lec1", year)).toEqual([]);
    expect(await feedExams("stu")).toEqual([]);

    ok(await run((ctx) => svc.setPublished(ctx, winter, true)));
    ok(await run((ctx) => svc.setPublished(ctx, mini, true)));
    expect((await myExams("stu", year)).map((s) => s.courseCode)).toEqual(["CA"]);
    expect((await myExams("lec1", year)).map((s) => s.courseCode)).toEqual(["CA"]);
    expect((await myExams("lec2", year)).map((s) => s.courseCode)).toEqual(["CP2"]);
    expect(await myExams("lec3", year)).toEqual([]);
    expect(await myExams("nobody", year)).toEqual([]);
    expect((await feedExams("stu")).map((s) => s.courseCode)).toEqual(["CA"]);
    expect((await feedExams("lec1")).map((s) => s.courseCode)).toEqual(["CA"]);

    // staff readers see every published sitting in the feed
    await db.userRole.create({
      data: { userId: "lec3", role: "secretary", scopeType: "INSTITUTION" },
    });
    expect((await feedExams("lec3")).map((s) => s.courseCode)).toEqual(["CA", "CP2", "CY3"]);

    ok(await run((ctx) => svc.setPublished(ctx, winter, false)));
    expect(await myExams("stu", year)).toEqual([]);

    // a suspended enrollment sees nothing
    await db.enrollment.update({ where: { id: enrollment }, data: { status: "SUSPENDED" } });
    ok(await run((ctx) => svc.setPublished(ctx, winter, true)));
    expect(await myExams("stu", year)).toEqual([]);
  });

  it("the iCal feed carries the published exams with their times (AC-9)", async () => {
    await student();
    ok(await addSitting(pcA1, { examinerIds: [staff1] }));
    ok(await run((ctx) => svc.setPublished(ctx, winter, true)));
    const { createFeedToken } = await import("./feed.service");
    const { GET } = await import("@/app/api/calendar/[token]/route");
    const get = async (userId: string) => {
      const created = await runAs({ ...actor, id: userId }, (ctx) => createFeedToken(ctx));
      const { token } = ok(created);
      const res = await GET(new Request("http://x"), { params: Promise.resolve({ token }) });
      return res.text();
    };
    const feed = await get("stu");
    expect(feed).toContain("SUMMARY:Provim: CA CA");
    expect(feed).toContain("DTSTART:20270112T090000");
    expect(feed).toContain("LOCATION:A1");
    expect(await get("lec2")).not.toContain("Provim:");
    expect(await get("lec1")).toContain("Provim: CA");
  });
});
