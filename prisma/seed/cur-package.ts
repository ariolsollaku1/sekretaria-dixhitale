// eslint-disable-next-line no-restricted-imports -- pure data; the module index pulls in server-only code
import { DEFAULT_PACKAGE_TEMPLATES } from "../../src/modules/cur/domain/package-template";
// eslint-disable-next-line no-restricted-imports -- pure constant
import { PACKAGE_TYPE } from "../../src/modules/cur/domain/package-rules";
import type { Seeder } from "./types";

// CUR-06: publishes a default cover template of the study package per language so the flow works in
// development. Skipped when any template of the language exists, so an edited one is not reset.
export const curPackageSeeder: Seeder = {
  name: "cur-package",
  envs: ["dev", "demo"],
  async run(db) {
    for (const language of ["sq", "en"] as const) {
      if (await db.documentTemplate.findFirst({ where: { type: PACKAGE_TYPE, language } }))
        continue;
      await db.documentTemplate.create({
        data: {
          type: PACKAGE_TYPE,
          version: 1,
          language,
          validFrom: new Date("2000-01-01T00:00:00Z"),
          status: "PUBLISHED",
          html: DEFAULT_PACKAGE_TEMPLATES[language],
          notes: "Default layout (Q-117); replace in the document administration.",
          publishedAt: new Date(),
        },
      });
    }
  },
};
