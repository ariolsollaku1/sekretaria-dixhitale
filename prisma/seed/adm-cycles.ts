import type { Seeder } from "./types";

// Demo data for development (ADM-02): one application cycle of the current year with an example
// document list, so /apply works out of the box. The dates and documents are illustrations (Q-96),
// not the college's rules. Skipped when a cycle with this name already exists.
const NAME = "Regjistrimi 2026-2027 (demo)";
const DOCUMENTS = [
  { key: "id-card", labelSq: "Letërnjoftimi (kopje)", labelEn: "ID card (copy)", required: true },
  {
    key: "diploma",
    labelSq: "Diploma e shkollës së mesme",
    labelEn: "High school diploma",
    required: true,
  },
  { key: "grades", labelSq: "Listë notash", labelEn: "Transcript of grades", required: true },
  { key: "photo", labelSq: "Foto", labelEn: "Photo", required: false },
];

export const admCyclesSeeder: Seeder = {
  name: "adm-cycles",
  envs: ["dev", "demo"],
  async run(db) {
    const year = await db.academicYear.findUnique({ where: { code: "2026-2027" } });
    if (!year) return;
    const existing = await db.applicationCycle.findUnique({
      where: { academicYearId_name: { academicYearId: year.id, name: NAME } },
    });
    if (existing) return;
    await db.applicationCycle.create({
      data: {
        academicYearId: year.id,
        name: NAME,
        opensOn: new Date("2026-06-01T00:00:00Z"),
        closesOn: new Date("2026-12-31T00:00:00Z"),
        active: true,
        documents: { create: DOCUMENTS.map((d, sequence) => ({ ...d, sequence })) },
      },
    });
  },
};
