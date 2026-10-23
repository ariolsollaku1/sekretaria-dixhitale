import type { Seeder } from "./types";

// Demo data for development (AC-13): one closed, one current, one planned year. Dates are an
// illustration (September to August), not a rule. Idempotent by `code`.
const YEARS = [
  {
    code: "2025-2026",
    status: "CLOSED",
    start: "2025-09-01",
    end: "2026-08-31",
    s1: ["2025-09-01", "2026-01-31"],
    s2: ["2026-02-01", "2026-08-31"],
  },
  {
    code: "2026-2027",
    status: "CURRENT",
    start: "2026-09-01",
    end: "2027-08-31",
    s1: ["2026-09-01", "2027-01-31"],
    s2: ["2027-02-01", "2027-08-31"],
  },
  {
    code: "2027-2028",
    status: "PLANNED",
    start: "2027-09-01",
    end: "2028-08-31",
    s1: ["2027-09-01", "2028-01-31"],
    s2: ["2028-02-01", "2028-08-31"],
  },
] as const;

const d = (day: string) => new Date(`${day}T00:00:00Z`);

export const academicYearsSeeder: Seeder = {
  name: "academic-years",
  envs: ["dev", "demo"],
  async run(db) {
    for (const y of YEARS) {
      const existing = await db.academicYear.findUnique({ where: { code: y.code } });
      if (existing) continue; // never overwrite what an administrator changed
      await db.academicYear.create({
        data: {
          code: y.code,
          status: y.status,
          startDate: d(y.start),
          endDate: d(y.end),
          semesters: {
            create: [
              { number: 1, startDate: d(y.s1[0]), endDate: d(y.s1[1]) },
              { number: 2, startDate: d(y.s2[0]), endDate: d(y.s2[1]) },
            ],
          },
        },
      });
    }
  },
};
