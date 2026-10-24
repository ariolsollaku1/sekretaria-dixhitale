// eslint-disable-next-line no-restricted-imports -- pure data; the module index pulls in server-only code
import { STAFF_FORMS } from "../../src/modules/off/domain/request-forms";
import type { Seeder } from "./types";

// OFF-01: publishes the four staff request forms so the flow can be tried in development. Skipped
// per key when a version exists, so an edited form is not reset.
export const offRequestsSeeder: Seeder = {
  name: "off-requests",
  envs: ["dev", "demo"],
  async run(db) {
    for (const form of STAFF_FORMS) {
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
