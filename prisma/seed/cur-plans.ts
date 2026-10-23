import type { Seeder } from "./types";

// Demo data for development: one approved plan for the demo bachelor program with the demo
// courses (illustrative figures, not a real curriculum). Skipped when the program has any plan.
export const curPlansSeeder: Seeder = {
  name: "cur-plans",
  envs: ["dev", "demo"],
  async run(db) {
    const program = await db.studyProgram.findUnique({ where: { code: "DEMO-BSC" } });
    const year = await db.academicYear.findUnique({ where: { code: "2026-2027" } });
    if (!program || !year) return;
    if ((await db.curriculumPlan.count({ where: { programId: program.id } })) > 0) return;
    const courses = await db.course.findMany({
      where: { code: { in: ["DEMO101", "DEMO102", "DEMO201"] } },
      orderBy: { code: "asc" },
    });
    if (courses.length === 0) return;
    const plan = await db.curriculumPlan.create({
      data: { programId: program.id, version: 1, validFromAcademicYearId: year.id },
    });
    await db.planCourse.createMany({
      data: courses.map((c, i) => ({
        planId: plan.id,
        courseId: c.id,
        yearOfStudy: i === 2 ? 2 : 1,
        semester: i === 1 ? 2 : 1,
        credits: c.defaultCredits,
        categoryId: c.categoryId,
        hoursLecture: c.hoursLecture,
        hoursSeminar: c.hoursSeminar,
        hoursLab: c.hoursLab,
        isElective: c.code === "DEMO102",
      })),
    });
    // freeze it: the database does not allow changes to the courses afterwards
    await db.curriculumPlan.update({
      where: { id: plan.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
  },
};
