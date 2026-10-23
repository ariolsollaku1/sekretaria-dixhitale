import type { Seeder } from "./types";

// Demo data for development: the dev lecturer teaches the first demo course to the demo group.
// Skipped when the group already has assignments.
export const curTeachingSeeder: Seeder = {
  name: "cur-teaching",
  envs: ["dev", "demo"],
  async run(db) {
    const person = await db.person.findUnique({
      where: { email: "lecturer@dev.logos.test" },
      include: { staff: true },
    });
    const group = await db.studentGroup.findFirst({
      where: {
        name: "Grupi 1",
        yearOfStudy: 1,
        cohort: { name: "2026", program: { code: "DEMO-BSC" } },
      },
      include: { cohort: true },
    });
    if (!person?.staff || !group) return;
    if ((await db.teachingAssignment.count({ where: { groupId: group.id } })) > 0) return;
    const planCourse = await db.planCourse.findFirst({
      where: { planId: group.cohort.curriculumPlanId, yearOfStudy: 1, course: { code: "DEMO101" } },
    });
    if (!planCourse) return;
    await db.teachingAssignment.create({
      data: {
        groupId: group.id,
        planCourseId: planCourse.id,
        staffId: person.staff.id,
        kind: "LECTURE",
        semester: planCourse.semester,
        plannedHours: planCourse.hoursLecture,
      },
    });
  },
};
