// eslint-disable-next-line no-restricted-imports -- pure data; the module index pulls in server-only code
import { SCHOLARSHIP_FORMS } from "../../src/modules/fin/domain/scholarship-forms";
import type { Seeder } from "./types";

// FIN-03: publishes the scholarship application forms (public and in-portal) so the flow can be
// tried in development. Skipped per key when a version exists, so an edited form is not reset.
export const finScholarshipFormsSeeder: Seeder = {
  name: "fin-scholarship-forms",
  envs: ["dev", "demo"],
  async run(db) {
    for (const form of SCHOLARSHIP_FORMS) {
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
