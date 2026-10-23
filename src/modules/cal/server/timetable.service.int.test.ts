import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/hr";
import "@/modules/cal";
import { groupEntries, roomEntries, staffEntries, studentEntries } from "./timetable.queries";
import * as svc from "./timetable.service";

const actor = { id: "sec-1", email: "s@t.test", name: "Sec", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "cal.timetable.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

let year: string, closedYear: string;
let a1: string, a2: string, a3: string, aClosed: string; // assignments
let group1: string, group2: string, staff1: string, staff2: string;

const add = (assignmentId: string, over: Record<string, unknown> = {}) =>
  run((ctx) =>
    svc.createEntry(ctx, {
      assignmentId,
      weekday: 1,
      startMinute: 480,
      endMinute: 540,
      room: "A1",
      validFrom: null,
      validTo: null,
      note: null,
      ...over,
    } as never),
  );

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "timetable_entries", "teaching_assignments", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "staff", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const d = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  const prog = (
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
  const mkYear = (code: string, start: string, status: "CURRENT" | "CLOSED") =>
    db.academicYear
      .create({
        data: {
          code,
          startDate: new Date(`${start}-09-01T00:00:00Z`),
          endDate: new Date(`${Number(start) + 1}-08-31T00:00:00Z`),
          status,
          semesters: {
            create: [
              {
                number: 1,
                startDate: new Date(`${start}-09-01T00:00:00Z`),
                endDate: new Date(`${Number(start) + 1}-01-31T00:00:00Z`),
              },
              {
                number: 2,
                startDate: new Date(`${Number(start) + 1}-02-01T00:00:00Z`),
                endDate: new Date(`${Number(start) + 1}-08-31T00:00:00Z`),
              },
            ],
          },
        },
      })
      .then((y) => y.id);
  closedYear = await mkYear("2024-2025", "2024", "CLOSED");
  year = await mkYear("2026-2027", "2026", "CURRENT");
  const plan = (
    await db.curriculumPlan.create({
      data: { programId: prog, version: 1, validFromAcademicYearId: year, status: "DRAFT" },
    })
  ).id;
  const course = async (code: string) =>
    (await db.course.create({ data: { code, name: code, defaultCredits: 6, departmentId: d.id } }))
      .id;
  const pc = async (courseId: string) =>
    (
      await db.planCourse.create({
        data: { planId: plan, courseId, yearOfStudy: 1, semester: 1, credits: 6 },
      })
    ).id;
  const pcA = await pc(await course("CA"));
  const pcB = await pc(await course("CB"));
  await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
  const cohort = (
    await db.cohort.create({
      data: { programId: prog, startAcademicYearId: year, curriculumPlanId: plan, name: "C" },
    })
  ).id;
  group1 = (
    await db.studentGroup.create({
      data: { cohortId: cohort, academicYearId: year, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  group2 = (
    await db.studentGroup.create({
      data: { cohortId: cohort, academicYearId: year, yearOfStudy: 1, name: "G2" },
    })
  ).id;
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
    return (
      await db.staff.create({
        data: {
          personId: p.id,
          kind: "ACADEMIC",
          category: "PAE",
          contractStart: new Date("2020-01-01T00:00:00Z"),
        },
      })
    ).id;
  };
  staff1 = await staffOf("lec1");
  staff2 = await staffOf("lec2");
  const asg = async (
    groupId: string,
    planCourseId: string,
    staffId: string,
    kind: "LECTURE" | "SEMINAR" = "LECTURE",
  ) =>
    (
      await db.teachingAssignment.create({
        data: { groupId, planCourseId, staffId, kind, semester: 1, plannedHours: 30 },
      })
    ).id;
  a1 = await asg(group1, pcA, staff1); // group1, lecturer1
  a2 = await asg(group1, pcB, staff2); // group1, lecturer2
  a3 = await asg(group2, pcA, staff1); // group2, lecturer1
  // an assignment in a closed year
  const oldCohort = (
    await db.cohort.create({
      data: {
        programId: prog,
        startAcademicYearId: closedYear,
        curriculumPlanId: plan,
        name: "OLD",
      },
    })
  ).id;
  const oldGroup = (
    await db.studentGroup.create({
      data: { cohortId: oldCohort, academicYearId: closedYear, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  aClosed = await asg(oldGroup, pcA, staff1);
});

describe("createEntry (AC-1..AC-4)", () => {
  it("creates an entry with the semester as default validity and audits", async () => {
    const { entryId } = ok(await add(a1));
    const e = await db.timetableEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(e.validFrom.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(e.validTo.toISOString().slice(0, 10)).toBe("2027-01-31");
    expect(await db.auditLog.count({ where: { action: "cal.timetable.create" } })).toBe(1);
  });

  it("refuses clashes of group, lecturer and room, naming them; allows touching times and other rooms", async () => {
    ok(await add(a1));
    const group = await add(a2, { room: "B2", startMinute: 500, endMinute: 560 }); // same group, other lecturer and room
    expect(group).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (!group.ok) expect(group.error.message).toMatch(/^CLASH:GROUP:CA/);
    const lecturer = await add(a3, { room: "B2" }); // same lecturer, other group
    if (!lecturer.ok) expect(lecturer.error.message).toContain("LECTURER");
    expect(lecturer.ok).toBe(false);
    const room = await add(a2, { startMinute: 490, endMinute: 520 }); // same room (and group)
    if (!room.ok) expect(room.error.message).toContain("ROOM");
    expect(room.ok).toBe(false);
    // touching times and a free room are fine
    expect((await add(a2, { startMinute: 540, endMinute: 600, room: "B2" })).ok).toBe(true);
    // another weekday is fine
    expect((await add(a3, { weekday: 2, room: "A1" })).ok).toBe(true);
    expect(await db.timetableEntry.count()).toBe(3);
  });

  it("allows the same slot when the validity dates do not overlap", async () => {
    ok(await add(a1, { validFrom: "2026-09-01", validTo: "2026-10-31" }));
    expect((await add(a3, { validFrom: "2026-11-01", validTo: "2027-01-31" })).ok).toBe(true);
    expect(
      (await add(a3, { weekday: 1, validFrom: "2026-10-31", validTo: "2026-11-30", room: "Z" })).ok,
    ).toBe(false); // lecturer overlaps on the 31st
  });

  it("refuses bad slots, dates outside the year, closed years and unknown assignments", async () => {
    for (const over of [
      { weekday: 9 },
      { startMinute: 600, endMinute: 600 },
      { endMinute: 1500 },
      { validFrom: "2026-10-05", validTo: "2026-10-01" },
      { validFrom: "2026-08-01" },
      { room: "x".repeat(51) },
    ])
      expect(await add(a1, over)).toMatchObject({ ok: false });
    expect(await add(aClosed)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await add("nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.timetableEntry.count()).toBe(0);
  });
});

describe("update and remove (AC-4)", () => {
  it("rechecks clashes on change, ignores the entry itself and removes with audit", async () => {
    const { entryId } = ok(await add(a1));
    ok(await add(a2, { weekday: 2, room: "B2" }));
    ok(
      await run((ctx) =>
        svc.updateEntry(ctx, entryId, {
          weekday: 1,
          startMinute: 490,
          endMinute: 550,
          room: "A1",
          validFrom: null,
          validTo: null,
          note: "n",
        }),
      ),
    );
    expect(
      await run((ctx) =>
        svc.updateEntry(ctx, entryId, {
          weekday: 2,
          startMinute: 480,
          endMinute: 540,
          room: "B2",
          validFrom: null,
          validTo: null,
          note: null,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    ok(await run((ctx) => svc.removeEntry(ctx, entryId)));
    expect(await db.timetableEntry.count()).toBe(1);
    expect(
      await db.auditLog.count({
        where: { action: { in: ["cal.timetable.update", "cal.timetable.remove"] } },
      }),
    ).toBe(2);
    expect(await run((ctx) => svc.removeEntry(ctx, entryId))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("refuses changes once the year is closed", async () => {
    const { entryId } = ok(await add(a1));
    await db.academicYear.update({ where: { id: year }, data: { status: "CLOSED" } });
    expect(
      await run((ctx) =>
        svc.updateEntry(ctx, entryId, {
          weekday: 3,
          startMinute: 480,
          endMinute: 540,
          room: null,
          validFrom: null,
          validTo: null,
          note: null,
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(await run((ctx) => svc.removeEntry(ctx, entryId))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });
});

describe("views (AC-5)", () => {
  it("lists by group and by room (case-insensitive)", async () => {
    ok(await add(a1));
    ok(await add(a2, { weekday: 2, room: "b2" }));
    ok(await add(a3, { weekday: 3, room: "A1" }));
    expect((await groupEntries(group1)).map((e) => e.courseCode)).toEqual(["CA", "CB"]);
    expect((await groupEntries(group2)).map((e) => e.courseCode)).toEqual(["CA"]);
    expect((await roomEntries("B2")).map((e) => e.weekday)).toEqual([2]);
    expect((await roomEntries("a1")).map((e) => e.weekday)).toEqual([1, 3]);
  });

  it("shows a lecturer their assignments and a student their group's timetable", async () => {
    ok(await add(a1));
    ok(await add(a2, { weekday: 2, room: "B2" }));
    ok(await add(a3, { weekday: 3, room: "C3" }));
    const person = (await db.staff.findUniqueOrThrow({ where: { id: staff1 } })).personId;
    await db.user.create({
      data: { id: "lec", email: "lec@t.test", name: "lec", personId: person },
    });
    expect((await staffEntries("lec", year))!.map((e) => e.weekday)).toEqual([1, 3]);
    await db.user.create({ data: { id: "nobody", email: "n@t.test", name: "n" } });
    expect(await staffEntries("nobody", year)).toBeNull();

    // a student of group1
    const sp = await db.person.create({
      data: {
        firstName: "S",
        lastName: "S",
        gender: "FEMALE",
        birthDate: new Date("2003-01-01T00:00:00Z"),
      },
    });
    const st = await db.student.create({ data: { personId: sp.id } });
    const prog = (await db.studyProgram.findFirstOrThrow()).id;
    const cohort = (await db.cohort.findFirstOrThrow({ where: { name: "C" } })).id;
    const en = await db.enrollment.create({
      data: {
        studentId: st.id,
        programId: prog,
        cohortId: cohort,
        registrationType: "FIRST_TIME",
        startedAt: new Date("2026-09-15T00:00:00Z"),
      },
    });
    await db.yearRegistration.create({
      data: { enrollmentId: en.id, academicYearId: year, yearOfStudy: 1, groupId: group1 },
    });
    await db.user.create({
      data: { id: "stu", email: "stu@t.test", name: "stu", personId: sp.id },
    });
    expect((await studentEntries("stu", year))!.map((e) => e.courseCode)).toEqual(["CA", "CB"]);
    expect(await studentEntries("nobody", year)).toBeNull();
    await db.enrollment.update({ where: { id: en.id }, data: { status: "SUSPENDED" } });
    expect(await studentEntries("stu", year)).toEqual([]);
  });
});

describe("import (CAL-02 AC-6)", () => {
  const header =
    "program,cohort,group,course,kind,weekday,start,end,room,valid_from,valid_to,lecturer_email";
  const csv = (...lines: string[]) => ({
    name: "t.csv",
    bytes: new TextEncoder().encode([header, ...lines].join("\n")),
  });
  const commit = async (file: ReturnType<typeof csv>) => {
    const { commitImport } = await import("./timetable-import.service");
    return run((ctx) => commitImport(ctx, file, year));
  };

  it("previews valid rows, resolves co-lecturers by e-mail, and reports unknown assignments and clashes inside the file", async () => {
    const { previewImport } = await import("./timetable-import.service");
    const p = await previewImport(
      csv(
        "p1,C,G1,CA,lecture,1,08:00,09:30,A1,,,",
        "p1,C,G1,CB,lecture,2,08:00,09:30,A2,,,",
        "p1,C,G1,CA,lecture,1,09:00,10:00,A3,,,", // clashes with row 2 (same group)
        "p1,C,G1,CZ,lecture,1,08:00,09:00,A1,,,", // unknown course
        "p1,C,G2,CA,seminar,1,08:00,09:00,A1,,,", // no seminar assignment
        "p1,C,G1,CA,lecture,1,11:00,12:00,A1,,,wrong@t.test",
      ),
      year,
      db,
    );
    if (!p.ok) throw new Error("preview failed");
    expect(p.counts).toEqual({ total: 6, valid: 2, invalid: 4 });
    expect(p.errors.map((e) => [e.row, e.code.split(":")[0]])).toEqual([
      [4, "CLASH"],
      [5, "assignmentNotFound"],
      [6, "assignmentNotFound"],
      [7, "lecturerNotFound"],
    ]);
    expect(await db.timetableEntry.count()).toBe(0);
  });

  it("creates every row or none", async () => {
    expect(
      ok(
        await commit(
          csv(
            "p1,C,G1,CA,Leksion,Monday,8:00,9:30,A1,,,",
            "p1,C,G1,CB,lecture,e martë,10:00,11:00,,01.10.2026,2027-01-15,",
          ),
        ),
      ),
    ).toEqual({ created: 2 });
    expect(await db.timetableEntry.count()).toBe(2);
    expect(await db.auditLog.count({ where: { action: "cal.timetable.import" } })).toBe(1);
    // a second file with one clashing row creates nothing
    const bad = await commit(
      csv("p1,C,G2,CA,lecture,3,08:00,09:00,B1,,,", "p1,C,G2,CA,lecture,1,08:30,09:00,B2,,,"),
    );
    expect(bad).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await db.timetableEntry.count()).toBe(2);
    expect(await commit({ name: "x.pdf", bytes: new Uint8Array([1]) })).toMatchObject({
      ok: false,
    });
  });
});
