import type { Seeder } from "./types";

// Neutral demo catalog for development (CUR-01 AC-13-style): two categories and a few courses in the
// demo departments. The real categories and courses are the client's data (Q-28).
const CATEGORIES = [
  { code: "COMPULSORY", nameSq: "E detyrueshme", nameEn: "Compulsory" },
  { code: "ELECTIVE", nameSq: "Zgjedhore", nameEn: "Elective" },
] as const;

const COURSES = [
  {
    code: "DEMO101",
    name: "Demo Course 101",
    category: "COMPULSORY",
    credits: 6,
    lecture: 30,
    seminar: 15,
    lab: 0,
    department: "DEMO-A1",
  },
  {
    code: "DEMO102",
    name: "Demo Course 102",
    category: "ELECTIVE",
    credits: 5,
    lecture: 30,
    seminar: 0,
    lab: 15,
    department: "DEMO-A1",
  },
  {
    code: "DEMO201",
    name: "Demo Course 201",
    category: "COMPULSORY",
    credits: 6,
    lecture: 45,
    seminar: 0,
    lab: 0,
    department: "DEMO-A2",
  },
] as const;

export const curCoursesSeeder: Seeder = {
  name: "cur-courses",
  envs: ["dev", "demo"],
  async run(db) {
    for (const c of CATEGORIES) {
      if (!(await db.courseCategory.findUnique({ where: { code: c.code } })))
        await db.courseCategory.create({ data: c });
    }
    for (const c of COURSES) {
      if (await db.course.findUnique({ where: { code: c.code } })) continue;
      const department = await db.department.findUnique({ where: { code: c.department } });
      const category = await db.courseCategory.findUnique({ where: { code: c.category } });
      if (!department) continue;
      await db.course.create({
        data: {
          code: c.code,
          name: c.name,
          nameEn: c.name,
          defaultCredits: c.credits,
          hoursLecture: c.lecture,
          hoursSeminar: c.seminar,
          hoursLab: c.lab,
          departmentId: department.id,
          categoryId: category?.id ?? null,
        },
      });
    }
  },
};
