import type { Seeder } from "./types";

// Demo data for development: the dev student gets a record, an enrollment in the demo cohort and a
// registration for the current demo year. Idempotent by e-mail; the account is linked via personId.
export const stuStudentsSeeder: Seeder = {
  name: "stu-students",
  envs: ["dev", "demo"],
  async run(db) {
    const email = "student@dev.logos.test";
    const user = await db.user.findUnique({ where: { email } });
    const cohort = await db.cohort.findFirst({
      where: { program: { code: "DEMO-BSC" }, name: "2026" },
      include: { groups: { where: { active: true }, take: 1 } },
    });
    const year = await db.academicYear.findUnique({ where: { code: "2026-2027" } });
    if (!user || !cohort || !year) return;
    const existing = await db.person.findUnique({ where: { email }, include: { student: true } });
    if (existing?.student) return;
    const person =
      existing ??
      (await db.person.create({
        data: {
          firstName: "Demo",
          lastName: "Student",
          gender: "MALE",
          birthDate: new Date("2005-06-20T00:00:00Z"),
          email,
          residence: "Tiranë",
        },
      }));
    const student = await db.student.create({ data: { personId: person.id, nim: "DEMO-0001" } });
    const enrollment = await db.enrollment.create({
      data: {
        studentId: student.id,
        programId: cohort.programId,
        cohortId: cohort.id,
        registrationType: "FIRST_TIME",
        startedAt: new Date("2026-09-15T00:00:00Z"),
        history: {
          create: { toStatus: "ACTIVE", effectiveDate: new Date("2026-09-15T00:00:00Z") },
        },
      },
    });
    const group = cohort.groups[0];
    if (group)
      await db.yearRegistration.create({
        data: {
          enrollmentId: enrollment.id,
          academicYearId: year.id,
          yearOfStudy: 1,
          groupId: group.id,
        },
      });
    await db.user.update({ where: { id: user.id }, data: { personId: person.id } });
  },
};
