import type { Seeder } from "./types";

// Neutral demo programs for development (ORG-03 AC-12), under the demo departments of org-units.ts.
// Credits and durations only illustrate the rules; the real offer is entered by the client.
const PROGRAMS = [
  {
    code: "DEMO-BSC",
    department: "DEMO-A1",
    name: "Demo Bachelor Program",
    cycle: "FIRST",
    subtype: null,
    durationYears: 3,
    totalCredits: 180,
  },
  {
    code: "DEMO-MSC",
    department: "DEMO-A1",
    name: "Demo Master Program",
    cycle: "SECOND",
    subtype: "PROFESSIONAL",
    durationYears: 2,
    totalCredits: 120,
  },
] as const;

export const orgProgramsSeeder: Seeder = {
  name: "org-programs",
  envs: ["dev", "demo"],
  async run(db) {
    for (const p of PROGRAMS) {
      if (await db.studyProgram.findUnique({ where: { code: p.code } })) continue;
      const department = await db.department.findUnique({ where: { code: p.department } });
      if (!department) continue;
      await db.studyProgram.create({
        data: {
          code: p.code,
          name: p.name,
          nameEn: p.name,
          cycle: p.cycle,
          subtype: p.subtype,
          durationYears: p.durationYears,
          totalCredits: p.totalCredits,
          departmentId: department.id,
        },
      });
    }
  },
};
