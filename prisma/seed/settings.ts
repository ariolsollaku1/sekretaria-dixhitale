import type { Seeder } from "./types";

// Technical defaults only; no business rules. `update: {}` keeps values an administrator changed.
const DEFAULTS: Record<string, unknown> = {
  "app.defaultLocale": "sq", // Q-17
  "app.timezone": "Europe/Tirane",
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
