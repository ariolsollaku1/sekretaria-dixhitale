import type { Seeder } from "./types";

// HR-06 (Q-25): the real questionnaires are configuration that HR/sysadmin enter before go-live.
// For development and demos, two short placeholder questionnaires are published so a campaign can be
// opened. Skipped per key when it already exists (the forms admin may have replaced it).
const scale = (key: string, sq: string, en: string) => ({
  key,
  type: "radio",
  label: { sq, en },
  required: true,
  options: [1, 2, 3, 4, 5].map((n) => ({
    value: String(n),
    label: { sq: String(n), en: String(n) },
  })),
});

const workflow = {
  initial: "new",
  states: [{ key: "new", label: { sq: "E re", en: "New" }, kind: "approved", final: true }],
  transitions: [],
};

const DEFINITIONS: Record<string, unknown> = {
  "hr-evaluation-lecturer": {
    title: { sq: "Vlerësimi i performancës së pedagogut", en: "Lecturer performance evaluation" },
    description: {
      sq: "Pyetësor provë (shkalla 1–5). Përmbajtja e vërtetë konfigurohet nga NJSBC/Burimet Njerëzore.",
      en: "Placeholder questionnaire (scale 1–5). The real content is configured by NJSBC/HR.",
    },
    fields: [
      scale("teaching", "Cilësia e mësimdhënies", "Teaching quality"),
      scale("research", "Aktiviteti kërkimor", "Research activity"),
      scale("service", "Kontributi në departament", "Contribution to the department"),
      {
        key: "comment",
        type: "textarea",
        label: { sq: "Komente", en: "Comments" },
        max: 2000,
      },
    ],
    workflow,
  },
  "hr-evaluation-staff": {
    title: { sq: "Vlerësimi i performancës së personelit", en: "Staff performance evaluation" },
    description: {
      sq: "Pyetësor provë (shkalla 1–5). Përmbajtja e vërtetë konfigurohet nga NJSBC/Burimet Njerëzore.",
      en: "Placeholder questionnaire (scale 1–5). The real content is configured by NJSBC/HR.",
    },
    fields: [
      scale("quality", "Cilësia e punës", "Quality of work"),
      scale("punctuality", "Respektimi i afateve", "Meeting deadlines"),
      scale("teamwork", "Bashkëpunimi", "Teamwork"),
      {
        key: "comment",
        type: "textarea",
        label: { sq: "Komente", en: "Comments" },
        max: 2000,
      },
    ],
    workflow,
  },
};

export const hrEvaluationsSeeder: Seeder = {
  name: "hr-evaluations",
  envs: ["dev", "demo"],
  async run(db) {
    for (const [key, definition] of Object.entries(DEFINITIONS)) {
      if (await db.formDefinition.findFirst({ where: { key } })) continue;
      await db.formDefinition.create({
        data: {
          key,
          version: 1,
          status: "PUBLISHED",
          audience: "AUTHENTICATED",
          ownerRoles: ["hr"],
          definition: definition as never,
          publishedAt: new Date(),
        },
      });
    }
  },
};
