import type { Seeder } from "./types";

// Neutral demo units for development (ORG-02 AC-12): NOT the real LOGOS structure, which the
// client enters through the admin screens. Idempotent by code; never overwrites edits.
const FACULTIES = [
  {
    code: "DEMO-A",
    name: "Demo Faculty A",
    nameEn: "Demo Faculty A",
    departments: [
      ["DEMO-A1", "Demo Department A1"],
      ["DEMO-A2", "Demo Department A2"],
    ],
  },
  {
    code: "DEMO-B",
    name: "Demo Faculty B",
    nameEn: "Demo Faculty B",
    departments: [["DEMO-B1", "Demo Department B1"]],
  },
] as const;

export const orgUnitsSeeder: Seeder = {
  name: "org-units",
  envs: ["dev", "demo"],
  async run(db) {
    for (const f of FACULTIES) {
      const faculty =
        (await db.faculty.findUnique({ where: { code: f.code } })) ??
        (await db.faculty.create({ data: { code: f.code, name: f.name, nameEn: f.nameEn } }));
      for (const [code, name] of f.departments) {
        const exists = await db.department.findUnique({ where: { code } });
        if (!exists)
          await db.department.create({ data: { code, name, nameEn: name, facultyId: faculty.id } });
      }
    }
  },
};
