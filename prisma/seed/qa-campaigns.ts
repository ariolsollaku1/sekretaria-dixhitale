import type { Seeder } from "./types";

// Development only: one SAMPLE draft campaign for the current year so the pages have something to
// show. The wording is an illustration, not the institution's questionnaire: NJSBC enters the real
// questions before go-live (Q-25, Q-104). Idempotent by (year, name).
const NAME = "Vlerësimi (shembull)";
const QUESTIONS = [
  {
    key: "clarity",
    section: "LECTURER",
    type: "SCALE",
    label: { sq: "Pedagogu shpjegon qartë.", en: "The lecturer explains clearly." },
    required: true,
  },
  {
    key: "prepared",
    section: "LECTURER",
    type: "SCALE",
    label: { sq: "Pedagogu vjen i përgatitur.", en: "The lecturer comes prepared." },
    required: true,
  },
  {
    key: "lecturerNote",
    section: "LECTURER",
    type: "TEXT",
    label: { sq: "Koment mbi pedagogun (opsional).", en: "Comment on the lecturer (optional)." },
    required: false,
  },
  {
    key: "adminHelp",
    section: "ADMINISTRATION",
    type: "SCALE",
    label: { sq: "Administrata përgjigjet në kohë.", en: "The administration answers in time." },
    required: true,
  },
  {
    key: "adminNote",
    section: "ADMINISTRATION",
    type: "TEXT",
    label: {
      sq: "Koment mbi administratën (opsional).",
      en: "Comment on the administration (optional).",
    },
    required: false,
  },
];

export const qaCampaignsSeeder: Seeder = {
  name: "qa-campaigns",
  envs: ["dev"],
  async run(db) {
    const year = await db.academicYear.findFirst({ where: { status: "CURRENT" } });
    if (!year) return;
    await db.evalCampaign.upsert({
      where: { academicYearId_name: { academicYearId: year.id, name: NAME } },
      create: { academicYearId: year.id, name: NAME, questions: QUESTIONS },
      update: {},
    });
  },
};
