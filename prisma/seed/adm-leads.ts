// eslint-disable-next-line no-restricted-imports -- pure data; the module index pulls in server-only code
import { INTEREST_FORM } from "../../src/modules/adm/domain/interest-form";
import type { Seeder } from "./types";

// ADM-01: publishes the public interest form and a few sample leads so the flow can be tried in
// development. Skipped when the form (or any lead) already exists, so edits are not reset.
export const admLeadsSeeder: Seeder = {
  name: "adm-leads",
  envs: ["dev", "demo"],
  async run(db) {
    if (!(await db.formDefinition.findFirst({ where: { key: INTEREST_FORM.key } }))) {
      await db.formDefinition.create({
        data: {
          key: INTEREST_FORM.key,
          version: 1,
          status: "PUBLISHED",
          audience: INTEREST_FORM.audience,
          ownerRoles: [...INTEREST_FORM.ownerRoles],
          definition: INTEREST_FORM.definition as never,
          publishedAt: new Date(),
        },
      });
    }
    if ((await db.lead.count()) > 0) return;
    const program = await db.studyProgram.findFirst({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true },
    });
    const now = new Date();
    const sample = [
      ["Arben", "Hoxha", "arben.hoxha@example.test", "EVENT", "Dita e hapur 2026", true, "NEW"],
      [
        "Blerta",
        "Krasniqi",
        "blerta.krasniqi@example.test",
        "CAMPAIGN",
        "Fushata e verës",
        true,
        "CONTACTED",
      ],
      ["Dritan", "Mema", null, "EVENT", "Dita e hapur 2026", false, "NEW"],
    ] as const;
    for (const [firstName, lastName, email, source, sourceNote, consent, status] of sample) {
      await db.lead.create({
        data: {
          firstName,
          lastName,
          email,
          phone: email ? null : "+355690000000",
          programId: program?.id ?? null,
          source,
          sourceNote,
          consent,
          consentAt: consent ? now : null,
          status,
          events: { create: { kind: "CREATED" } },
        },
      });
    }
  },
};
