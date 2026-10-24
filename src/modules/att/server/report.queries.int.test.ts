import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/hr";
import "../permissions";
import { addDays, todayInTirane } from "../domain/session-rules";
import {
  assignmentSummaries,
  attendanceRows,
  getThreshold,
  ownSummary,
  scopedAssignmentWhere,
} from "./report.queries";

const today = todayInTirane();
const ago = (n: number) => addDays(today, -n);
const d = (s: string) => new Date(`${s}T00:00:00Z`);

let yearId: string;
let a1: string, a2: string; // a1 in program P1 (dep1), a2 in program P2 (dep2)
let s1: string, s2: string, s3: string; // s1,s2 in a1's group; s3 in a2's group
let prog1: string, prog2: string, dep1: string, dep2: string;

const person = (n: string) =>
  db.person.create({
    data: {
      firstName: n,
      lastName: "L",
      gender: "MALE",
      birthDate: d("1990-01-01"),
      email: `${n}@t.test`,
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

type Status = "PRESENT" | "ABSENT" | "EXCUSED";
async function held(
  assignmentId: string,
  date: string,
  start: number,
  hours: number,
  marks: [string, Status][],
  status: "HELD" | "PLANNED" | "CANCELLED" = "HELD",
) {
  const s = await db.classSession.create({
    data: {
      assignmentId,
      date: d(date),
      startMinute: start,
      endMinute: start + 45 * hours,
      hours,
      status,
      createdById: "sec",
      updatedById: "sec",
    },
  });
  for (const [studentId, st] of marks)
    await db.attendanceMark.create({ data: { sessionId: s.id, studentId, status: st } });
  return s.id;
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "attendance_marks", "class_sessions", "timetable_entries", "teaching_assignments", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "staff", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  dep1 = (await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } })).id;
  dep2 = (await db.department.create({ data: { code: "D2", name: "D2", facultyId: f.id } })).id;
  const mkProg = async (code: string, departmentId: string) =>
    (
      await db.studyProgram.create({
        data: {
          departmentId,
          cycle: "FIRST",
          code,
          name: code,
          durationYears: 3,
          totalCredits: 180,
        },
      })
    ).id;
  prog1 = await mkProg("P1", dep1);
  prog2 = await mkProg("P2", dep2);
  yearId = (
    await db.academicYear.create({
      data: {
        code: "CUR",
        startDate: d(ago(100)),
        endDate: d(addDays(today, 250)),
        status: "CURRENT",
      },
    })
  ).id;
  const lecturer = async (n: string) => {
    const p = await person(n);
    return (
      await db.staff.create({
        data: {
          personId: p.id,
          kind: "ACADEMIC",
          category: "PAE",
          contractStart: d("2020-01-01"),
        },
      })
    ).id;
  };
  const staff = await lecturer("lec");
  const setup = async (programId: string, departmentId: string, code: string) => {
    const plan = (
      await db.curriculumPlan.create({
        data: { programId, version: 1, validFromAcademicYearId: yearId, status: "DRAFT" },
      })
    ).id;
    const course = await db.course.create({
      data: { code, name: `Course ${code}`, defaultCredits: 6, departmentId },
    });
    const pc = (
      await db.planCourse.create({
        data: { planId: plan, courseId: course.id, yearOfStudy: 1, semester: 1, credits: 6 },
      })
    ).id;
    await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
    const cohort = (
      await db.cohort.create({
        data: { programId, startAcademicYearId: yearId, curriculumPlanId: plan, name: `C${code}` },
      })
    ).id;
    const group = (
      await db.studentGroup.create({
        data: { cohortId: cohort, academicYearId: yearId, yearOfStudy: 1, name: `G${code}` },
      })
    ).id;
    const assignment = (
      await db.teachingAssignment.create({
        data: {
          groupId: group,
          planCourseId: pc,
          staffId: staff,
          kind: "LECTURE",
          semester: 1,
          plannedHours: 30,
        },
      })
    ).id;
    const student = async (n: string) => {
      const p = await person(n);
      const st = await db.student.create({ data: { personId: p.id } });
      const en = await db.enrollment.create({
        data: {
          studentId: st.id,
          programId,
          cohortId: cohort,
          registrationType: "FIRST_TIME",
          status: "ACTIVE",
          startedAt: d("2026-01-01"),
        },
      });
      await db.yearRegistration.create({
        data: { enrollmentId: en.id, academicYearId: yearId, yearOfStudy: 1, groupId: group },
      });
      return { id: st.id, personId: p.id };
    };
    return { assignment, student };
  };
  const one = await setup(prog1, dep1, "CA");
  const two = await setup(prog2, dep2, "CB");
  a1 = one.assignment;
  a2 = two.assignment;
  const st1 = await one.student("stu1");
  const st2 = await one.student("stu2");
  const st3 = await two.student("stu3");
  s1 = st1.id;
  s2 = st2.id;
  s3 = st3.id;

  await user("sec", "secretary");
  await user("hod1", "head_of_department", undefined, ["DEPARTMENT", dep1]);
  await user("coord2", "program_coordinator", undefined, ["PROGRAM", prog2]);
  await user("u-stu1", "student", st1.personId);
  await user("u-stu3", "student", st3.personId);
  await user("lec", "lecturer");

  // a1: two held classes of 2 h; s1 present both, s2 present one and absent one (50 %)
  await held(a1, ago(10), 480, 2, [
    [s1, "PRESENT"],
    [s2, "PRESENT"],
  ]);
  await held(a1, ago(3), 480, 2, [
    [s1, "PRESENT"],
    [s2, "ABSENT"],
  ]);
  // a1 noise that must not count: planned, cancelled
  await held(a1, ago(2), 600, 2, [[s2, "ABSENT"]], "PLANNED");
  await held(a1, ago(1), 600, 2, [[s2, "ABSENT"]], "CANCELLED");
  // a2: one 1 h class, s3 excused
  await held(a2, ago(3), 480, 1, [[s3, "EXCUSED"]]);
});

const base = () => ({ yearId });

describe("attendanceRows (AC-1, AC-2, AC-3)", () => {
  it("counts only held classes, hours based, excused as absent", async () => {
    const rows = await attendanceRows({ id: "sec" }, base());
    expect(rows).toHaveLength(3);
    const r1 = rows.find((r) => r.studentId === s1)!;
    expect(r1).toMatchObject({
      classes: 2,
      heldHours: 4,
      presentHours: 4,
      percent: 100,
      below: false,
    });
    const r2 = rows.find((r) => r.studentId === s2)!;
    expect(r2).toMatchObject({
      heldHours: 4,
      presentHours: 2,
      absentHours: 2,
      percent: 50,
      below: true,
    });
    const r3 = rows.find((r) => r.studentId === s3)!;
    expect(r3).toMatchObject({ excusedHours: 1, percent: 0, below: true });
  });

  it("filters: below only, course, program, kind and dates", async () => {
    const f = (over: object) => attendanceRows({ id: "sec" }, { ...base(), ...over });
    expect((await f({ below: true })).map((r) => r.studentId).sort()).toEqual([s2, s3].sort());
    expect(await f({ course: "ca" })).toHaveLength(2);
    expect(await f({ program: "p2" })).toHaveLength(1);
    expect(await f({ kind: "SEMINAR" })).toHaveLength(0);
    const range = await f({ from: ago(5), to: ago(1) });
    expect(range.find((r) => r.studentId === s1)).toMatchObject({ classes: 1, heldHours: 2 });
    expect(await f({ from: ago(100), to: ago(50) })).toHaveLength(0);
  });

  it("follows the threshold setting", async () => {
    await db.systemSetting.create({ data: { key: "att.thresholdPercent", value: 40 } });
    expect(await getThreshold()).toBe(40);
    const rows = await attendanceRows({ id: "sec" }, { ...base(), below: true });
    expect(rows.map((r) => r.studentId)).toEqual([s3]);
  });

  it("ignores another academic year", async () => {
    expect(await attendanceRows({ id: "sec" }, { yearId: "nope" })).toEqual([]);
  });
});

describe("assignmentSummaries (AC-4)", () => {
  it("summarizes per assignment", async () => {
    const rows = await assignmentSummaries({ id: "sec" }, base());
    const a = rows.find((r) => r.assignmentId === a1)!;
    expect(a).toMatchObject({
      classes: 2,
      heldHours: 4,
      students: 2,
      averagePercent: 75,
      below: 1,
      courseCode: "CA",
      group: "GCA",
    });
    expect(rows.find((r) => r.assignmentId === a2)).toMatchObject({ students: 1, below: 1 });
    expect(
      await assignmentSummaries({ id: "sec" }, { ...base(), program: "p2", below: true }),
    ).toHaveLength(1);
  });
});

describe("scope (AC-5)", () => {
  it("a head of department sees only their department's program", async () => {
    const rows = await attendanceRows({ id: "hod1" }, base());
    expect(new Set(rows.map((r) => r.program))).toEqual(new Set(["P1"]));
    const sums = await assignmentSummaries({ id: "hod1" }, base());
    expect(sums.map((r) => r.assignmentId)).toEqual([a1]);
  });
  it("a program coordinator sees only their program", async () => {
    const rows = await attendanceRows({ id: "coord2" }, base());
    expect(rows.map((r) => r.studentId)).toEqual([s3]);
  });
  it("a lecturer or a student has no scope and sees nothing", async () => {
    expect(await attendanceRows({ id: "lec" }, base())).toEqual([]);
    expect(await attendanceRows({ id: "u-stu1" }, base())).toEqual([]);
    expect(await attendanceRows({ id: "ghost" }, base())).toEqual([]);
    expect(await scopedAssignmentWhere({ id: "sec" })).toEqual({});
  });
});

describe("ownSummary (AC-6)", () => {
  it("returns only the student's own figures", async () => {
    const mine = await ownSummary("u-stu1", yearId);
    expect(mine?.threshold).toBe(75);
    expect(mine?.courses).toHaveLength(1);
    expect(mine?.courses[0]).toMatchObject({
      courseCode: "CA",
      heldHours: 4,
      percent: 100,
      below: false,
    });
    const other = await ownSummary("u-stu3", yearId);
    expect(other?.courses).toHaveLength(1);
    expect(other?.courses[0]).toMatchObject({
      courseCode: "CB",
      excusedHours: 1,
      percent: 0,
      below: true,
    });
  });
  it("is null for a user without a student record", async () => {
    expect(await ownSummary("sec", yearId)).toBeNull();
  });
});
