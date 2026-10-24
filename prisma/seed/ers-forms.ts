// eslint-disable-next-line no-restricted-imports -- pure data; the module index pulls in server-only code
import { ERASMUS_FORMS } from "../../src/modules/ers/domain/erasmus-forms";
import type { Seeder } from "./types";

// ERS-01: publishes the six Erasmus application forms so the flow can be tried in development.
// Skipped per key when a version exists, so an edited form is not reset.
export const ersFormsSeeder: Seeder = {
  name: "ers-forms",
  envs: ["dev", "demo"],
  async run(db) {
    for (const form of ERASMUS_FORMS) {
      if (await db.formDefinition.findFirst({ where: { key: form.key } })) continue;
      await db.formDefinition.create({
        data: {
          key: form.key,
          version: 1,
          status: "PUBLISHED",
          audience: form.audience,
          ownerRoles: form.ownerRoles,
          definition: form.definition as never,
          publishedAt: new Date(),
        },
      });
    }
  },
};
