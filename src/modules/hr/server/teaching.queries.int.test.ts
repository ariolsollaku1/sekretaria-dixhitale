import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/cal";
import "@/modules/att";
import "@/modules/ntf";
import { addDays, isoWeekday, todayInTirane } from "@/modules/att";
import { getAssignmentRoster, getTeachingHub } from "./teaching.queries";

const today = todayInTirane();
const d = (s: string) => new Date(`${s}T00:00:00Z`);

let yearId: string, a1: string, aOther: string;
let userL1: string, userL2: string, userNoStaff: string;

async function person(n: string) {
  return db.person.create({
    data: {
      firstName: n,
      lastName: "T",
      gender: "MALE",
      birthDate: d("1990-01-01"),
      email: `${n}@t.test`,
    },
  });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "attendance_marks", "class_sessions", "timetable_entries", "teaching_assignments", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "staff", "calendar_events", "announcements", "notifications", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  const prog = (
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
  yearId = (
    await db.academicYear.create({
      data: {
        code: "CUR",
        startDate: d(addDays(today, -100)),
        endDate: d(addDays(today, 250)),
        status: "CURRENT",
      },
    })
  ).id;
  const plan = (
    await db.curriculumPlan.create({
      data: { programId: prog, version: 1, validFromAcademicYearId: yearId, status: "DRAFT" },
    })
  ).id;
  const mkCourse = async (code: string, semester: number) => {
    const c = await db.course.create({
      data: { code, name: `Course ${code}`, defaultCredits: 6, departmentId: dep.id },
    });
    return (
      await db.planCourse.create({
        data: { planId: plan, courseId: c.id, yearOfStudy: 1, semester, credits: 6 },
      })
    ).id;
  };
  const pc1 = await mkCourse("C1", 1);
  const pc2 = await mkCourse("C2", 2);
  await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
  const cohort = (
    await db.cohort.create({
      data: { programId: prog, startAcademicYearId: yearId, curriculumPlanId: plan, name: "C" },
    })
  ).id;
  const g1 = (
    await db.studentGroup.create({
      data: { cohortId: cohort, academicYearId: yearId, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  const g2 = (
    await db.studentGroup.create({
      data: { cohortId: cohort, academicYearId: yearId, yearOfStudy: 1, name: "G2" },
    })
  ).id;
  const staffOf = async (n: string) => {
    const p = await person(n);
    const st = await db.staff.create({
      data: { personId: p.id, kind: "ACADEMIC", category: "PAE", contractStart: d("2020-01-01") },
    });
    const u = await db.user.create({ data: { email: `${n}@t.test`, name: n, personId: p.id } });
    return { staffId: st.id, userId: u.id };
  };
  const l1 = await staffOf("lec1");
  const l2 = await staffOf("lec2");
  userL1 = l1.userId;
  userL2 = l2.userId;
  userNoStaff = (await db.user.create({ data: { email: "ns@t.test", name: "ns" } })).id;
  const asg = async (groupId: string, planCourseId: string, staffId: string, semester: number) =>
    (
      await db.teachingAssignment.create({
        data: { groupId, planCourseId, staffId, kind: "LECTURE", semester, plannedHours: 30 },
      })
    ).id;
  a1 = await asg(g1, pc1, l1.staffId, 1);
  await asg(g1, pc2, l1.staffId, 2);
  aOther = await asg(g2, pc1, l2.staffId, 1);

  const student = async (n: string, groupId: string, status: "ACTIVE" | "SUSPENDED") => {
    const p = await person(n);
    const st = await db.student.create({ data: { personId: p.id, studentNumber: `S-${n}` } });
    const en = await db.enrollment.create({
      data: {
        studentId: st.id,
        programId: prog,
        cohortId: cohort,
        registrationType: "FIRST_TIME",
        status,
        startedAt: d("2026-01-01"),
      },
    });
    await db.yearRegistration.create({
      data: { enrollmentId: en.id, academicYearId: yearId, yearOfStudy: 1, groupId },
    });
    return st.id;
  };
  const s1 = await student("stu1", g1, "ACTIVE");
  await student("stu2", g1, "ACTIVE");
  await student("stu3", g1, "SUSPENDED");
  await student("stu4", g2, "ACTIVE");

  // a1: one held session with an absence, one pending, one upcoming
  const mk = (date: string, status: "HELD" | "PLANNED", startMinute: number) =>
    db.classSession.create({
      data: {
        assignmentId: a1,
        date: d(date),
        startMinute,
        endMinute: startMinute + 90,
        hours: 2,
        status,
      },
    });
  const held = await mk(addDays(today, -3), "HELD", 480);
  await mk(addDays(today, -1), "PLANNED", 480);
  await mk(addDays(today, 5), "PLANNED", 480);
  await db.attendanceMark.create({ data: { sessionId: held.id, studentId: s1, status: "ABSENT" } });
  await db.classSession.create({
    data: {
      assignmentId: aOther,
      date: d(addDays(today, -2)),
      startMinute: 600,
      endMinute: 690,
      hours: 2,
      status: "PLANNED",
    },
  });

  // a1 meets today
  await db.timetableEntry.create({
    data: {
      assignmentId: a1,
      weekday: isoWeekday(today),
      startMinute: 540,
      endMinute: 630,
      validFrom: d(addDays(today, -100)),
      validTo: d(addDays(today, 250)),
    },
  });
  await db.timetableEntry.create({
    data: {
      assignmentId: aOther,
      weekday: isoWeekday(today),
      startMinute: 700,
      endMinute: 740,
      validFrom: d(addDays(today, -100)),
      validTo: d(addDays(today, 250)),
    },
  });
});

describe("getTeachingHub", () => {
  it("lists own assignments by semester with roster size and attendance progress", async () => {
    const hub = await getTeachingHub({ id: userL1 }, yearId);
    expect(hub).not.toBeNull();
    expect(hub!.assignmentCount).toBe(2);
    expect(hub!.semesters.map((g) => g.semester)).toEqual([1, 2]);
    const row1 = hub!.semesters[0]!.rows[0]!;
    expect(row1.id).toBe(a1);
    expect(row1.students).toBe(2); // the suspended student is not on the roster
    expect(row1.progress).toEqual({ held: 1, pending: 1, upcoming: 1, absences: 1 });
    expect(hub!.semesters[1]!.rows[0]!.progress).toEqual({
      held: 0,
      pending: 0,
      upcoming: 0,
      absences: 0,
    });
  });

  it("shows only today's classes of the lecturer, never a colleague's", async () => {
    const mine = await getTeachingHub({ id: userL1 }, yearId);
    expect(mine!.classes.map((c) => c.startMinute)).toEqual([540]);
    const other = await getTeachingHub({ id: userL2 }, yearId);
    expect(other!.assignmentCount).toBe(1);
    expect(other!.semesters[0]!.rows[0]!.id).toBe(aOther);
    expect(other!.classes.map((c) => c.startMinute)).toEqual([700]);
    expect(other!.semesters[0]!.rows[0]!.progress.pending).toBe(1);
  });

  it("is null without a staff record and empty without a year", async () => {
    expect(await getTeachingHub({ id: userNoStaff }, yearId)).toBeNull();
    const none = await getTeachingHub({ id: userL1 }, null);
    expect(none!.assignmentCount).toBe(0);
    expect(none!.classes).toEqual([]);
  });
});

describe("getAssignmentRoster", () => {
  it("returns the roster of an own assignment", async () => {
    const r = await getAssignmentRoster({ id: userL1 }, yearId, a1);
    expect(r!.students.map((s) => s.studentNumber).sort()).toEqual(["S-stu1", "S-stu2"]);
    expect(r!.course).toContain("C1");
  });

  it("is null for a colleague's assignment, an unknown id and a user without staff", async () => {
    expect(await getAssignmentRoster({ id: userL1 }, yearId, aOther)).toBeNull();
    expect(await getAssignmentRoster({ id: userL1 }, yearId, "nope")).toBeNull();
    expect(await getAssignmentRoster({ id: userNoStaff }, yearId, a1)).toBeNull();
    expect(await getAssignmentRoster({ id: userL2 }, yearId, a1)).toBeNull();
  });
});
