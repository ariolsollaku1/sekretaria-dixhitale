import { beforeEach, describe, expect, it } from "vitest";
import { clearAudienceResolvers, registerAudienceResolver, resolveAudience } from "@/lib/audience";
import { db } from "@/lib/db";
import "@/modules/stu";
import { studentAudience } from "./audience";
import { getPortalHome } from "./home.queries";

// 2026-10-27 is a Tuesday (weekday 2).
const NOW = new Date("2026-10-27T09:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

let prog: string, progOther: string, plan: string, year: string;
let cohort: string, group: string, userA: string, userB: string, studentA: string;
let courseA: string;

async function mkUser(email: string, first: string, number: string) {
  const person = await db.person.create({
    data: {
      firstName: first,
      lastName: "Test",
      gender: "FEMALE",
      birthDate: d("2003-01-01"),
      email,
    },
  });
  const user = await db.user.create({ data: { email, name: first, personId: person.id } });
  await db.userRole.create({ data: { userId: user.id, role: "student", scopeType: "SELF" } });
  const student = await db.student.create({ data: { personId: person.id, studentNumber: number } });
  return { user, student };
}

beforeEach(async () => {
  clearAudienceResolvers();
  registerAudienceResolver(studentAudience);
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "timetable_entries", "teaching_assignments", "plan_courses", "courses", "staff", "calendar_events", "announcements", "notifications", "year_registrations", "enrollment_status_events", "enrollments", "students", "student_groups", "cohorts", "curriculum_plans", "user_roles", "study_programs", "departments", "faculties", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  const mkProg = (code: string, cycle: "FIRST" | "SECOND") =>
    db.studyProgram
      .create({
        data: {
          departmentId: dep.id,
          cycle,
          code,
          name: `Prog ${code}`,
          durationYears: 3,
          totalCredits: 180,
        },
      })
      .then((p) => p.id);
  prog = await mkProg("P1", "FIRST");
  progOther = await mkProg("P2", "SECOND");
  year = (
    await db.academicYear.create({
      data: {
        code: "2026-2027",
        startDate: d("2026-09-01"),
        endDate: d("2027-08-31"),
        status: "CURRENT",
      },
    })
  ).id;
  plan = (
    await db.curriculumPlan.create({
      data: { programId: prog, version: 1, validFromAcademicYearId: year, status: "DRAFT" },
    })
  ).id;
  courseA = (
    await db.course.create({
      data: { code: "CA", name: "Course A", defaultCredits: 6, departmentId: dep.id },
    })
  ).id;
  const courseB = (
    await db.course.create({
      data: { code: "CB", name: "Course B", defaultCredits: 6, departmentId: dep.id },
    })
  ).id;
  const courseY2 = (
    await db.course.create({
      data: { code: "CY2", name: "Year two", defaultCredits: 6, departmentId: dep.id },
    })
  ).id;
  await db.planCourse.createMany({
    data: [
      { planId: plan, courseId: courseA, yearOfStudy: 1, semester: 1, credits: 6 },
      {
        planId: plan,
        courseId: courseB,
        yearOfStudy: 1,
        semester: 2,
        credits: 4,
        isElective: true,
      },
      { planId: plan, courseId: courseY2, yearOfStudy: 2, semester: 3, credits: 6 },
    ],
  });
  cohort = (
    await db.cohort.create({
      data: { programId: prog, startAcademicYearId: year, curriculumPlanId: plan, name: "C26" },
    })
  ).id;
  group = (
    await db.studentGroup.create({
      data: { cohortId: cohort, academicYearId: year, yearOfStudy: 1, name: "G1" },
    })
  ).id;
  const a = await mkUser("a@student.test", "Ana", "900001");
  const b = await mkUser("b@student.test", "Besa", "900002");
  userA = a.user.id;
  userB = b.user.id;
  studentA = a.student.id;
});

const enroll = (
  studentId: string,
  status: "ACTIVE" | "SUSPENDED" | "GRADUATED" = "ACTIVE",
  programId = prog,
  cohortId = cohort,
) =>
  db.enrollment.create({
    data: {
      studentId,
      programId,
      cohortId,
      registrationType: "FIRST_TIME",
      status,
      startedAt: d("2026-09-15"),
    },
  });

describe("getPortalHome", () => {
  it("is null for a user without a student record", async () => {
    const p = await db.person.create({
      data: { firstName: "X", lastName: "Y", gender: "MALE", birthDate: d("1990-01-01") },
    });
    const u = await db.user.create({ data: { email: "x@t.test", name: "X", personId: p.id } });
    expect(await getPortalHome(u, NOW)).toBeNull();
    const none = await db.user.create({ data: { email: "n@t.test", name: "N" } });
    expect(await getPortalHome(none, NOW)).toBeNull();
  });

  it("shows the open enrollment with year, group, and hides plan courses of a draft plan", async () => {
    const e = await enroll(studentA);
    await db.yearRegistration.create({
      data: { enrollmentId: e.id, academicYearId: year, yearOfStudy: 1, groupId: group },
    });
    const home = (await getPortalHome({ id: userA }, NOW))!;
    expect(home.open).toHaveLength(1);
    expect(home.open[0]).toMatchObject({
      programCode: "P1",
      cohortName: "C26",
      yearOfStudy: 1,
      groupName: "G1",
      status: "ACTIVE",
      courses: { state: "planDraft" },
    });
    expect(home.yearCode).toBe("2026-2027");
  });

  it("lists the courses of the current year of study once the plan is approved (AC-3)", async () => {
    const e = await enroll(studentA);
    await db.yearRegistration.create({
      data: { enrollmentId: e.id, academicYearId: year, yearOfStudy: 1, groupId: group },
    });
    await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
    const c = (await getPortalHome({ id: userA }, NOW))!.open[0]!.courses;
    expect(c.state).toBe("ok");
    if (c.state !== "ok") return;
    expect(c.credits).toBe(10);
    expect(c.semesters.map((s) => [s.semester, s.courses.map((x) => x.code)])).toEqual([
      [1, ["CA"]],
      [2, ["CB"]],
    ]);
    expect(c.semesters[1]!.courses[0]!.isElective).toBe(true);
  });

  it("says why when there is no yearly registration", async () => {
    await enroll(studentA);
    expect((await getPortalHome({ id: userA }, NOW))!.open[0]!.courses).toEqual({
      state: "noRegistration",
    });
  });

  it("counts closed enrollments and shows no classes, events or courses for a student without an active one (AC-9)", async () => {
    await enroll(studentA, "GRADUATED");
    await db.calendarEvent.create({
      data: {
        academicYearId: year,
        title: "E",
        type: "EVENT",
        startDate: d("2026-11-01"),
        endDate: d("2026-11-01"),
      },
    });
    const home = (await getPortalHome({ id: userA }, NOW))!;
    expect(home.open).toEqual([]);
    expect(home.closedCount).toBe(1);
    expect(home.events).toEqual([]);
    expect(home.classes).toEqual([]);
  });

  it("suspended: shown, but no courses (AC-9)", async () => {
    await enroll(studentA, "SUSPENDED");
    const home = (await getPortalHome({ id: userA }, NOW))!;
    expect(home.open[0]!.courses).toEqual({ state: "notActive" });
  });

  it("lists today's classes of the student's group only (AC-4)", async () => {
    const e = await enroll(studentA);
    await db.yearRegistration.create({
      data: { enrollmentId: e.id, academicYearId: year, yearOfStudy: 1, groupId: group },
    });
    const otherGroup = (
      await db.studentGroup.create({
        data: { cohortId: cohort, academicYearId: year, yearOfStudy: 1, name: "G2" },
      })
    ).id;
    const pc = await db.planCourse.findFirstOrThrow({ where: { courseId: courseA } });
    const person = await db.person.create({
      data: { firstName: "Lek", lastName: "Turer", gender: "MALE", birthDate: d("1980-01-01") },
    });
    const staff = await db.staff.create({
      data: {
        personId: person.id,
        kind: "ACADEMIC",
        category: "PAE",
        contractStart: d("2020-01-01"),
      },
    });
    const asg = (groupId: string) =>
      db.teachingAssignment
        .create({
          data: {
            groupId,
            planCourseId: pc.id,
            staffId: staff.id,
            kind: "LECTURE",
            semester: 1,
            plannedHours: 30,
          },
        })
        .then((a) => a.id);
    const mine = await asg(group);
    const theirs = await asg(otherGroup);
    const entry = (
      assignmentId: string,
      weekday: number,
      startMinute: number,
      from = "2026-09-01",
      to = "2027-01-31",
    ) =>
      db.timetableEntry.create({
        data: {
          assignmentId,
          weekday,
          startMinute,
          endMinute: startMinute + 90,
          room: "A1",
          validFrom: d(from),
          validTo: d(to),
        },
      });
    await entry(mine, 2, 600);
    await entry(mine, 2, 480);
    await entry(mine, 3, 480); // another weekday
    await entry(mine, 2, 700, "2026-09-01", "2026-10-01"); // expired
    await entry(theirs, 2, 480); // another group
    const home = (await getPortalHome({ id: userA }, NOW))!;
    expect(home.classes.map((c) => c.startMinute)).toEqual([480, 600]);
    expect(home.classes[0]).toMatchObject({ courseCode: "CA", room: "A1" });
  });

  it("lists the next 5 visible events by audience (AC-5, AC-11)", async () => {
    await enroll(studentA);
    const ev = (title: string, start: string, end: string, extra: object = {}) =>
      db.calendarEvent.create({
        data: {
          academicYearId: year,
          title,
          type: "EVENT",
          startDate: d(start),
          endDate: d(end),
          ...extra,
        },
      });
    await ev("past", "2026-10-01", "2026-10-02");
    await ev("ongoing", "2026-10-20", "2026-10-30");
    await ev("cancelled", "2026-10-28", "2026-10-28", { active: false });
    await ev("mine", "2026-10-29", "2026-10-29", { audience: "PROGRAM", programId: prog });
    await ev("other program", "2026-10-29", "2026-10-29", {
      audience: "PROGRAM",
      programId: progOther,
    });
    await ev("second cycle", "2026-10-29", "2026-10-29", { audience: "CYCLE", cycle: "SECOND" });
    await ev("first cycle", "2026-10-30", "2026-10-30", { audience: "CYCLE", cycle: "FIRST" });
    for (const n of [1, 2, 3, 4]) await ev(`later ${n}`, `2026-11-0${n}`, `2026-11-0${n}`);
    const home = (await getPortalHome({ id: userA }, NOW))!;
    expect(home.events.map((e) => e.title)).toEqual([
      "ongoing",
      "mine",
      "first cycle",
      "later 1",
      "later 2",
    ]);
  });

  it("shows the latest 3 live announcements for the student and the notifications with the unread count (AC-6)", async () => {
    await enroll(studentA);
    const ann = (title: string, extra: object = {}) =>
      db.announcement.create({
        data: {
          title,
          body: "b",
          status: "PUBLISHED",
          publishAt: new Date("2026-10-01T00:00:00Z"),
          ...extra,
        },
      });
    await ann("pinned", { pinned: true });
    await ann("a2", { publishAt: new Date("2026-10-02T00:00:00Z") });
    await ann("a3", { publishAt: new Date("2026-10-03T00:00:00Z") });
    await ann("a4", { publishAt: new Date("2026-10-04T00:00:00Z") });
    await ann("staff only", { audience: "STAFF" });
    await ann("draft", { status: "DRAFT" });
    for (let i = 0; i < 7; i++)
      await db.notification.create({
        data: {
          userId: userA,
          type: "x.y",
          title: `n${i}`,
          body: "b",
          readAt: i === 0 ? new Date() : null,
        },
      });
    await db.notification.create({
      data: { userId: userB, type: "x.y", title: "other", body: "b" },
    });
    const home = (await getPortalHome({ id: userA }, NOW))!;
    expect(home.announcements.map((a) => a.title)).toEqual(["pinned", "a4", "a3"]);
    expect(home.notifications.unread).toBe(6);
    expect(home.notifications.latest).toHaveLength(5);
    expect(home.notifications.latest.every((n) => n.title !== "other")).toBe(true);
  });

  it("never mixes in another student's data (AC-8)", async () => {
    await enroll(studentA);
    const b = await db.student.findFirstOrThrow({ where: { person: { email: "b@student.test" } } });
    await enroll(b.id, "ACTIVE", progOther);
    const home = (await getPortalHome({ id: userA }, NOW))!;
    expect(home.firstName).toBe("Ana");
    expect(home.open.map((e) => e.programCode)).toEqual(["P1"]);
  });
});

describe("audience resolver (AC-11)", () => {
  it("gives the cycles and programs of ACTIVE enrollments only", async () => {
    await enroll(studentA);
    await enroll(studentA, "GRADUATED", progOther, cohort);
    expect(await resolveAudience(userA)).toEqual({ cycles: ["FIRST"], programIds: [prog] });
    expect(await resolveAudience(userB)).toEqual({ cycles: [], programIds: [] });
  });
});
