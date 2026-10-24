import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import "@/modules/stu";
import { entryRows } from "./entry.queries";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const NONE = { program: "", faculty: "", cycle: "" };

let y25: string, y26: string, p1: string, p2: string;
let n = 0;

async function enroll(opts: {
  program: string;
  year: string;
  type?: "FIRST_TIME" | "TRANSFER";
  average?: number;
  last: string;
}) {
  n += 1;
  const person = await db.person.create({
    data: {
      firstName: "Ana",
      lastName: opts.last,
      gender: "FEMALE",
      birthDate: d("2005-01-01"),
      email: `entry${n}@t.test`,
    },
  });
  const student = await db.student.create({ data: { personId: person.id } });
  const plan = await db.curriculumPlan.create({
    data: {
      programId: opts.program,
      version: n,
      validFromAcademicYearId: opts.year,
      status: "APPROVED",
    },
  });
  const cohort = await db.cohort.create({
    data: {
      programId: opts.program,
      startAcademicYearId: opts.year,
      curriculumPlanId: plan.id,
      name: `C${n}`,
    },
  });
  const enrollment = await db.enrollment.create({
    data: {
      studentId: student.id,
      programId: opts.program,
      cohortId: cohort.id,
      registrationType: opts.type ?? "FIRST_TIME",
      startedAt: d("2026-09-15"),
    },
  });
  if (opts.average !== undefined) {
    const cycle = await db.applicationCycle.create({
      data: {
        academicYearId: opts.year,
        name: `Cycle ${n}`,
        opensOn: d("2026-01-01"),
        closesOn: d("2026-12-31"),
      },
    });
    await db.application.create({
      data: {
        reference: `AP-T${String(n).padStart(7, "0")}`,
        cycleId: cycle.id,
        programId: opts.program,
        status: "ENROLLED",
        firstName: "Ana",
        lastName: opts.last,
        gender: "FEMALE",
        birthDate: d("2005-01-01"),
        email: `entry${n}@t.test`,
        emailKey: `entry${n}@t.test`,
        phone: "1",
        address: "A",
        schoolName: "Gjimnazi",
        graduationYear: 2025,
        averageGrade: opts.average,
        consentAt: new Date(),
        tokenHash: `hash${n}`,
        tokenExpiresAt: new Date(Date.now() + 1e9),
        studentId: student.id,
        enrollmentId: enrollment.id,
      },
    });
  }
}

async function user(id: string, role: "secretary" | "program_coordinator", programId?: string) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: {
      userId: id,
      role,
      scopeType: programId ? "PROGRAM" : "INSTITUTION",
      scopeId: programId ?? null,
    },
  });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "application_documents", "applications", "application_cycles", "year_registrations", "enrollment_status_events", "enrollments", "students", "student_groups", "cohorts", "curriculum_plans", "user_roles", "study_programs", "departments", "faculties", "academic_years" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  const prog = (code: string, cycle: "FIRST" | "SECOND") =>
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
  p1 = await prog("P1", "FIRST");
  p2 = await prog("P2", "SECOND");
  const year = (code: string, start: string, status: "CLOSED" | "CURRENT") =>
    db.academicYear
      .create({
        data: {
          code,
          startDate: d(start),
          endDate: d(`${Number(start.slice(0, 4)) + 1}-08-31`),
          status,
        },
      })
      .then((y) => y.id);
  y25 = await year("2025-2026", "2025-09-01", "CLOSED");
  y26 = await year("2026-2027", "2026-09-01", "CURRENT");
});

describe("entryRows (STU-05 AC-1, AC-5, AC-6)", () => {
  it("takes the average from the application, leaves it empty without one, and counts first registrations of the year only", async () => {
    await enroll({ program: p1, year: y26, average: 8.5, last: "Aa" });
    await enroll({ program: p1, year: y26, last: "Bb" }); // entered by hand: no average
    await enroll({ program: p1, year: y26, type: "TRANSFER", average: 7, last: "Cc" }); // not first registration
    await enroll({ program: p1, year: y25, average: 9, last: "Dd" }); // other year
    await user("sec", "secretary");

    const rows = await entryRows({ id: "sec" }, y26, NONE);
    expect(rows.map((r) => [r.name, r.average, r.schoolName])).toEqual(
      expect.arrayContaining([
        ["Ana Aa", 8.5, "Gjimnazi"],
        ["Ana Bb", null, null],
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(await entryRows({ id: "sec" }, null, NONE)).toHaveLength(3);
  });

  it("filters by program, faculty and cycle", async () => {
    await enroll({ program: p1, year: y26, average: 8, last: "Aa" });
    await enroll({ program: p2, year: y26, average: 9, last: "Bb" });
    await user("sec", "secretary");
    expect(
      (await entryRows({ id: "sec" }, y26, { ...NONE, program: "p2" })).map((r) => r.program),
    ).toEqual(["P2"]);
    expect(
      (await entryRows({ id: "sec" }, y26, { ...NONE, cycle: "FIRST" })).map((r) => r.program),
    ).toEqual(["P1"]);
    expect(await entryRows({ id: "sec" }, y26, { ...NONE, faculty: "F" })).toHaveLength(2);
    expect(await entryRows({ id: "sec" }, y26, { ...NONE, faculty: "X" })).toHaveLength(0);
  });

  it("applies the scope of the user", async () => {
    await enroll({ program: p1, year: y26, average: 8, last: "Aa" });
    await enroll({ program: p2, year: y26, average: 9, last: "Bb" });
    await user("coord", "program_coordinator", p1);
    expect((await entryRows({ id: "coord" }, y26, NONE)).map((r) => r.program)).toEqual(["P1"]);
  });
});
