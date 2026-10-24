import type { Seeder } from "./types";

// Technical defaults only; no business rules. `update: {}` keeps values an administrator changed.
const DEFAULTS: Record<string, unknown> = {
  "app.defaultLocale": "sq", // Q-17
  "app.timezone": "Europe/Tirane",
  // ATT-01 (Q-61 working assumption): days after a class during which the lecturer may enter attendance.
  "att.editWindowDays": 7,
  // ATT-02 (Q-91 working assumption): attendance threshold in percent (75 % is the Q-12 research finding).
  "att.thresholdPercent": 75,
  // ORG-03: allowed program durations per cycle and Master subtypes (defaults from the ORG brief;
  // the institution can change them without a deployment).
  "org.programDurations": { FIRST: [3], SECOND: [1, 2] },
  "org.programSubtypes": [
    { code: "PROFESSIONAL", nameSq: "Master profesional", nameEn: "Professional Master" },
    { code: "SCIENTIFIC", nameSq: "Master shkencor", nameEn: "Master of Science" },
  ],
};

export const settingsSeeder: Seeder = {
  name: "settings",
  envs: ["dev", "demo"],
  async run(db) {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await db.systemSetting.upsert({
        where: { key },
        create: { key, value: value as string },
        update: {},
      });
    }
  },
};
