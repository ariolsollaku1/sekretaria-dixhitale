import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/hr";
import "@/modules/cal";
import "../permissions";
import { addDays, isoWeekday, todayInTirane } from "../domain/session-rules";
import { getSessionDetail, groupSessions, ownAbsences, ownSessions } from "./session.queries";
import * as svc from "./session.service";

let actorId = "lec1";
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
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
    permission: "att.attendance.record",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const code = (r: ActionResult<unknown>) => (r.ok ? "OK" : `${r.error.code}:${r.error.message}`);

const today = todayInTirane();
const ago = (n: number) => addDays(today, -n);
const ahead = (n: number) => addDays(today, n);

let yearId: string, closedYearId: string;
let a1: string, aOther: string, aClosed: string; // assignments: lec1's, lec2's, one in a closed year
let group1: string, group2: string, dep1: string, dep2: string;
let s1: string, s2: string, s3: string, sSusp: string, sOther: string; // students
let entryId: string;

const person = (n: string, over: Record<string, unknown> = {}) =>
  db.person.create({
    data: {
      firstName: n,
      lastName: "L",
      gender: "MALE",
      birthDate: new Date("1990-01-01T00:00:00Z"),
      email: `${n}@t.test`,
      ...over,
    },
  });
async function user(id: string, role: string, personId?: string, scope?: [string, string]) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id, personId } });
  await db.userRole.create({
    data: {
      userId: id,
      role: role as never,
      scopeType: (scope?.[0] as never) ?? "INSTITUTION",
      scopeId: scope?.[1] ?? null,
    },
  });
}

const session = (over: Record<string, unknown> = {}) =>
  run((ctx) =>
    svc.addSession(ctx, "record", {
      assignmentId: a1,
      date: ago(1),
      startMinute: 480,
      endMinute: 570,
      hours: 2,
      topic: null,
      ...over,
    } as never),
  );
const marks = (statuses: Record<string, "PRESENT" | "ABSENT" | "EXCUSED"> = {}) =>
  [s1, s2, s3].map((studentId) => ({
    studentId,
    status: statuses[studentId] ?? "PRESENT",
    note: null,
  }));
const save = (
  sessionId: string,
  mode: "record" | "correct" = "record",
  over: Record<string, unknown> = {},
) =>
  run((ctx) =>
    svc.saveAttendance(ctx, mode, {
      sessionId,
      hours: 2,
      topic: "Intro",
      marks: marks(),
      reason: null,
      ...over,
    } as never),
  );

beforeEach(async () => {
  actorId = "lec1";
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "attendance_marks", "class_sessions", "timetable_entries", "teaching_assignments", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "staff", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  dep1 = (await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } })).id;
  dep2 = (await db.department.create({ data: { code: "D2", name: "D2", facultyId: f.id } })).id;
  const prog = (
    await db.studyProgram.create({
      data: {
        departmentId: dep1,
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
        code: "CUR",
        startDate: new Date(`${ago(100)}T00:00:00Z`),
        endDate: new Date(`${ahead(250)}T00:00:00Z`),
        status: "CURRENT",
      },
    })
  ).id;
  const plan = (
    await db.curriculumPlan.create({
      data: { programId: prog, version: 1, validFromAcademicYearId: yearId, status: "DRAFT" },
    })
  ).id;
  const course = await db.course.create({
    data: { code: "CA", name: "CA", defaultCredits: 6, departmentId: dep1 },
  });
  const pc = (
    await db.planCourse.create({
      data: { planId: plan, courseId: course.id, yearOfStudy: 1, semester: 1, credits: 6 },
    })
  ).id;
  await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
  const cohort = (
    await db.cohort.create({
      data: { programId: prog, startAcademicYearId: yearId, curriculumPlanId: plan, name: "C" },
    })
  ).id;
  const oldCohort = (
    await db.cohort.create({
      data: {
        programId: prog,
        startAcademicYearId: closedYearId,
        curriculumPlanId: plan,
        name: "OLD",
      },
    })
  ).id;
  const mkGroup = (cohortId: string, academicYearId: string, name: string) =>
    db.studentGroup
      .create({ data: { cohortId, academicYearId, yearOfStudy: 1, name } })
      .then((g) => g.id);
  group1 = await mkGroup(cohort, yearId, "G1");
  group2 = await mkGroup(cohort, yearId, "G2");
  const oldGroup = await mkGroup(oldCohort, closedYearId, "G1");

  const staffOf = async (n: string) => {
    const p = await person(n);
    const st = await db.staff.create({
      data: {
        personId: p.id,
        kind: "ACADEMIC",
        category: "PAE",
        contractStart: new Date("2020-01-01T00:00:00Z"),
      },
    });
    return { staffId: st.id, personId: p.id };
  };
  const l1 = await staffOf("lec1");
  const l2 = await staffOf("lec2");
  const asg = async (groupId: string, staffId: string) =>
    (
      await db.teachingAssignment.create({
        data: {
          groupId,
          planCourseId: pc,
          staffId,
          kind: "LECTURE",
          semester: 1,
          plannedHours: 30,
        },
      })
    ).id;
  a1 = await asg(group1, l1.staffId);
  aOther = await asg(group2, l2.staffId);
  aClosed = await asg(oldGroup, l1.staffId);

  const student = async (
    n: string,
    groupId: string,
    status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
    withUser = false,
  ) => {
    const p = await person(n);
    const st = await db.student.create({ data: { personId: p.id } });
    const en = await db.enrollment.create({
      data: {
        studentId: st.id,
        programId: prog,
        cohortId: cohort,
        registrationType: "FIRST_TIME",
        status,
        startedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await db.yearRegistration.create({
      data: { enrollmentId: en.id, academicYearId: yearId, yearOfStudy: 1, groupId },
    });
    if (withUser) await user(`u-${n}`, "student", p.id);
    return st.id;
  };
  s1 = await student("stu1", group1, "ACTIVE", true);
  s2 = await student("stu2", group1);
  s3 = await student("stu3", group1);
  sSusp = await student("stu4", group1, "SUSPENDED");
  sOther = await student("stu5", group2, "ACTIVE", true);

  await user("lec1", "lecturer", l1.personId, ["SELF", ""]);
  await db.userRole.updateMany({ where: { userId: "lec1" }, data: { scopeType: "SELF", scopeId: null } });
  await user("lec2", "lecturer", l2.personId);
  await db.userRole.updateMany({ where: { userId: "lec2" }, data: { scopeType: "SELF", scopeId: null } });
  await user("sec", "secretary");
  await user("hod1", "head_of_department", undefined, ["DEPARTMENT", dep1]);
  await user("hod2", "head_of_department", undefined, ["DEPARTMENT", dep2]);

  // a Monday-and-Wednesday timetable for a1 valid for the whole year
  const mon = await db.timetableEntry.create({
    data: {
      assignmentId: a1,
      weekday: 1,
      startMinute: 480,
      endMinute: 570,
      validFrom: new Date(`${ago(100)}T00:00:00Z`),
      validTo: new Date(`${ahead(250)}T00:00:00Z`),
    },
  });
  entryId = mon.id;
  await db.timetableEntry.create({
    data: {
      assignmentId: a1,
      weekday: 3,
      startMinute: 600,
      endMinute: 645,
      validFrom: new Date(`${ago(100)}T00:00:00Z`),
      validTo: new Date(`${ahead(250)}T00:00:00Z`),
    },
  });
});

describe("generateSessions (AC-2)", () => {
  it("creates a session per timetable day in the range, skips existing ones, audits", async () => {
    const from = ago(13);
    const to = ago(7); // 7 days: exactly one Monday and one Wednesday
    const r1 = ok(await run((ctx) => svc.generateSessions(ctx, "record", { assignmentId: a1, from, to })));
    expect(r1).toEqual({ created: 2, skipped: 0 });
    const rows = await db.classSession.findMany({ orderBy: { date: "asc" } });
    expect(rows.map((r) => isoWeekday(r.date.toISOString().slice(0, 10))).sort()).toEqual([1, 3]);
    expect(rows.find((r) => r.startMinute === 480)).toMatchObject({
      hours: 2,
      timetableEntryId: entryId,
      status: "PLANNED",
    });
    expect(rows.find((r) => r.startMinute === 600)?.hours).toBe(1);
    const r2 = ok(await run((ctx) => svc.generateSessions(ctx, "record", { assignmentId: a1, from, to })));
    expect(r2).toEqual({ created: 0, skipped: 2 });
    expect(await db.auditLog.count({ where: { action: "att.session.generate" } })).toBe(2);
  });

  it("refuses another lecturer, a bad range, and a closed year", async () => {
    actorId = "lec2";
    const other = await run((ctx) =>
      svc.generateSessions(ctx, "record", { assignmentId: a1, from: ago(7), to: ago(1) }),
    );
    expect(other).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    actorId = "lec1";
    const long = await run((ctx) =>
      svc.generateSessions(ctx, "record", { assignmentId: a1, from: ago(100), to: ahead(100) }),
    );
    expect(long).toMatchObject({ ok: false, error: { fieldErrors: { to: ["rangeTooLong"] } } });
    const closed = await run((ctx) =>
      svc.generateSessions(ctx, "record", { assignmentId: aClosed, from: "2020-10-01", to: "2020-10-07" }),
    );
    expect(code(closed)).toBe("CONFLICT:YEAR_CLOSED");
  });

  it("lets the Secretariat generate for any group", async () => {
    actorId = "sec";
    const r = ok(
      await run((ctx) =>
        svc.generateSessions(ctx, "correct", { assignmentId: aOther, from: ago(7), to: ago(1) }),
      ),
    );
    expect(r.created).toBe(0); // aOther has no timetable
    const mine = ok(
      await run((ctx) =>
        svc.generateSessions(ctx, "correct", { assignmentId: a1, from: ago(7), to: ago(1) }),
      ),
    );
    expect(mine.created).toBe(2);
  });
});

describe("addSession (AC-1, AC-3)", () => {
  it("creates an extra class and refuses a duplicate and dates outside the year", async () => {
    const { sessionId } = ok(await session({ topic: "Make-up" }));
    expect(await db.classSession.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({
      topic: "Make-up",
      status: "PLANNED",
      hours: 2,
    });
    expect(code(await session())).toBe("CONFLICT:DUPLICATE");
    expect(await session({ date: "2020-01-01" })).toMatchObject({
      ok: false,
      error: { fieldErrors: { date: ["outsideYear"] } },
    });
    expect(await session({ hours: 13 })).toMatchObject({ ok: false });
    expect(await db.auditLog.count({ where: { action: "att.session.create" } })).toBe(1);
  });

  it("the database refuses hours outside 1..12", async () => {
    await expect(
      db.classSession.create({
        data: {
          assignmentId: a1,
          date: new Date(`${today}T00:00:00Z`),
          startMinute: 480,
          endMinute: 540,
          hours: 0,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("saveAttendance (AC-4..AC-7)", () => {
  it("stores one mark per roster student, holds the session, audits", async () => {
    const { sessionId } = ok(await session());
    const r = ok(await save(sessionId, "record", { marks: marks({ [s2]: "ABSENT", [s3]: "EXCUSED" }) }));
    expect(r.counts).toEqual({ present: 1, absent: 1, excused: 1 });
    const s = await db.classSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s).toMatchObject({ status: "HELD", topic: "Intro", hours: 2 });
    expect(s.heldAt).not.toBeNull();
    expect(await db.attendanceMark.count({ where: { sessionId } })).toBe(3);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "att.attendance.save" } });
    expect(audit.entityId).toBe(sessionId);
  });

  it("replaces marks on a second save and keeps heldAt", async () => {
    const { sessionId } = ok(await session());
    ok(await save(sessionId));
    const first = (await db.classSession.findUniqueOrThrow({ where: { id: sessionId } })).heldAt;
    ok(await save(sessionId, "record", { marks: marks({ [s1]: "ABSENT" }) }));
    expect((await db.attendanceMark.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId, studentId: s1 } } })).status).toBe("ABSENT");
    expect((await db.classSession.findUniqueOrThrow({ where: { id: sessionId } })).heldAt).toEqual(first);
    expect(await db.attendanceMark.count({ where: { sessionId } })).toBe(3);
  });

  it("the roster excludes suspended students and other groups; marks must be complete", async () => {
    const { sessionId } = ok(await session());
    expect(
      await save(sessionId, "record", { marks: marks().slice(0, 2) }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await save(sessionId, "record", {
        marks: [...marks(), { studentId: sSusp, status: "PRESENT", note: null }],
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await save(sessionId, "record", {
        marks: [...marks(), { studentId: sOther, status: "PRESENT", note: null }],
      }),
    ).toMatchObject({ ok: false });
    const detail = await getSessionDetail({ id: "lec1" }, sessionId);
    expect(detail?.roster.map((r) => r.studentId).sort()).toEqual([s1, s2, s3].sort());
  });

  it("refuses a future session, a closed window, a cancelled session and a foreign lecturer", async () => {
    const future = ok(await session({ date: ahead(2) })).sessionId;
    expect(code(await save(future))).toBe("CONFLICT:FUTURE");
    const old = ok(await session({ date: ago(8) })).sessionId;
    expect(code(await save(old))).toBe("CONFLICT:WINDOW_CLOSED");
    const edge = ok(await session({ date: ago(7), startMinute: 600, endMinute: 660 })).sessionId;
    ok(await save(edge));
    const gone = ok(await session({ date: ago(2) })).sessionId;
    ok(await run((ctx) => svc.cancelSession(ctx, "record", { sessionId: gone })));
    expect(code(await save(gone))).toBe("CONFLICT:CANCELLED");
    actorId = "lec2";
    const mine = (await db.classSession.findFirstOrThrow({ where: { date: new Date(`${ago(7)}T00:00:00Z`) } })).id;
    expect(await save(mine)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("honours the window setting", async () => {
    await db.systemSetting.create({ data: { key: "att.editWindowDays", value: 1 } });
    const two = ok(await session({ date: ago(2) })).sessionId;
    expect(code(await save(two))).toBe("CONFLICT:WINDOW_CLOSED");
    const one = ok(await session({ date: ago(1), startMinute: 700, endMinute: 760 })).sessionId;
    ok(await save(one));
  });

  it("after the window only the Secretariat, with a reason, audited", async () => {
    const old = ok(await session({ date: ago(30) })).sessionId;
    actorId = "sec";
    expect(await save(old, "correct")).toMatchObject({
      ok: false,
      error: { fieldErrors: { reason: ["required"] } },
    });
    ok(await save(old, "correct", { reason: "Lecturer forgot to submit" }));
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "att.attendance.save" } });
    expect(audit.reason).toBe("Lecturer forgot to submit");
    expect(await db.attendanceMark.count({ where: { sessionId: old } })).toBe(3);
  });

  it("nobody saves in a closed year", async () => {
    const s = await db.classSession.create({
      data: {
        assignmentId: aClosed,
        date: new Date("2020-10-05T00:00:00Z"),
        startMinute: 480,
        endMinute: 570,
        hours: 2,
      },
    });
    actorId = "sec";
    expect(code(await save(s.id, "correct", { reason: "x" }))).toBe("CONFLICT:YEAR_CLOSED");
  });

  it("a head of another department cannot correct (scope)", async () => {
    const { sessionId } = ok(await session());
    actorId = "hod2";
    expect(await save(sessionId, "correct", { reason: "x" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
});

describe("updateSession / cancelSession (AC-8)", () => {
  it("changes a planned session, keeps a held one's date and time", async () => {
    const { sessionId } = ok(await session());
    ok(
      await run((ctx) =>
        svc.updateSession(ctx, "record", {
          sessionId,
          date: ago(2),
          startMinute: 540,
          endMinute: 600,
          hours: 1,
          topic: "x",
          reason: null,
        }),
      ),
    );
    ok(await save(sessionId));
    const moved = await run((ctx) =>
      svc.updateSession(ctx, "record", {
        sessionId,
        date: ago(1),
        startMinute: 540,
        endMinute: 600,
        hours: 1,
        topic: "x",
        reason: null,
      }),
    );
    expect(moved).toMatchObject({ ok: false, error: { fieldErrors: { date: ["heldFixed"] } } });
    ok(
      await run((ctx) =>
        svc.updateSession(ctx, "record", {
          sessionId,
          date: ago(2),
          startMinute: 540,
          endMinute: 600,
          hours: 3,
          topic: "y",
          reason: null,
        }),
      ),
    );
    expect((await db.classSession.findUniqueOrThrow({ where: { id: sessionId } })).hours).toBe(3);
  });

  it("cancels a planned session; a held one only by the Secretariat with a reason; marks stay", async () => {
    const planned = ok(await session({ date: ago(2) })).sessionId;
    ok(await run((ctx) => svc.cancelSession(ctx, "record", { sessionId: planned })));
    expect((await db.classSession.findUniqueOrThrow({ where: { id: planned } })).status).toBe("CANCELLED");
    expect(code(await run((ctx) => svc.cancelSession(ctx, "record", { sessionId: planned })))).toBe("CONFLICT:CANCELLED");

    const held = ok(await session()).sessionId;
    ok(await save(held));
    expect(code(await run((ctx) => svc.cancelSession(ctx, "record", { sessionId: held })))).toBe("CONFLICT:HELD_LOCKED");
    actorId = "sec";
    expect(await run((ctx) => svc.cancelSession(ctx, "correct", { sessionId: held }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { reason: ["required"] } },
    });
    ok(await run((ctx) => svc.cancelSession(ctx, "correct", { sessionId: held, reason: "Room closed" })));
    expect(await db.attendanceMark.count({ where: { sessionId: held } })).toBe(3);
    expect(await db.classSession.count()).toBe(2); // never deleted
  });
});

describe("queries (AC-9..AC-11)", () => {
  it("lists a lecturer's own sessions with counts; null without a staff record", async () => {
    const a = ok(await session()).sessionId;
    ok(await save(a, "record", { marks: marks({ [s2]: "ABSENT" }) }));
    const own = await ownSessions("lec1", yearId);
    expect(own).toHaveLength(1);
    expect(own![0]).toMatchObject({ status: "HELD", counts: { present: 2, absent: 1, excused: 0 } });
    expect(await ownSessions("lec2", yearId)).toEqual([]);
    expect(await ownSessions("sec", yearId)).toBeNull();
  });

  it("group sessions follow the reader's scope", async () => {
    ok(await session());
    expect(await groupSessions({ id: "sec" }, group1)).toHaveLength(1);
    expect(await groupSessions({ id: "hod1" }, group1)).toHaveLength(1);
    expect(await groupSessions({ id: "hod2" }, group1)).toBeNull();
    expect(await groupSessions({ id: "lec1" }, group1)).toBeNull();
    expect(await groupSessions({ id: "u-stu1" }, group1)).toBeNull();
  });

  it("session detail: owner edits, others read or see nothing", async () => {
    const { sessionId } = ok(await session());
    expect((await getSessionDetail({ id: "lec1" }, sessionId))?.access).toMatchObject({ read: true, edit: "record" });
    expect((await getSessionDetail({ id: "sec" }, sessionId))?.access).toMatchObject({ edit: "correct" });
    expect((await getSessionDetail({ id: "hod1" }, sessionId))?.access).toMatchObject({ read: true, edit: null });
    expect(await getSessionDetail({ id: "lec2" }, sessionId)).toBeNull();
    expect(await getSessionDetail({ id: "hod2" }, sessionId)).toBeNull();
    expect(await getSessionDetail({ id: "u-stu1" }, sessionId)).toBeNull();
  });

  it("a student sees only their own absent/excused marks of held sessions", async () => {
    const held = ok(await session()).sessionId;
    ok(await save(held, "record", { marks: marks({ [s1]: "ABSENT", [s2]: "ABSENT" }) }));
    const second = ok(await session({ date: ago(2) })).sessionId;
    ok(await save(second, "record", { marks: marks({ [s1]: "EXCUSED" }) }));
    const third = ok(await session({ date: ago(3) })).sessionId;
    ok(await save(third)); // present: not listed
    await session({ date: ago(4) }); // planned: not listed
    const mine = await ownAbsences("u-stu1", yearId);
    expect(mine?.map((m) => m.status)).toEqual(["ABSENT", "EXCUSED"]);
    expect(mine).toHaveLength(2);
    expect(JSON.stringify(mine)).not.toContain("note");
    expect(await ownAbsences("u-stu5", yearId)).toEqual([]);
    expect(await ownAbsences("sec", yearId)).toBeNull();
  });
});
