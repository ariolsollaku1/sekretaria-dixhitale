import type { Seeder } from "./types";

// Demo data for development: one cohort of the demo bachelor program on its approved plan, with a
// group in the current demo year. Skipped when the program already has a cohort.
export const orgCohortsSeeder: Seeder = {
  name: "org-cohorts",
  envs: ["dev", "demo"],
  async run(db) {
    const program = await db.studyProgram.findUnique({ where: { code: "DEMO-BSC" } });
    const year = await db.academicYear.findUnique({ where: { code: "2026-2027" } });
    if (!program || !year) return;
    if ((await db.cohort.count({ where: { programId: program.id } })) > 0) return;
    const plan = await db.curriculumPlan.findFirst({
      where: { programId: program.id, status: "APPROVED" },
      orderBy: { version: "desc" },
    });
    if (!plan) return;
    const cohort = await db.cohort.create({
      data: {
        programId: program.id,
        startAcademicYearId: year.id,
        curriculumPlanId: plan.id,
        name: "2026",
      },
    });
    await db.studentGroup.create({
      data: { cohortId: cohort.id, academicYearId: year.id, yearOfStudy: 1, name: "Grupi 1" },
    });
  },
};
