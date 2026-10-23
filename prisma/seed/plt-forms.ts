import type { Seeder } from "./types";

// Demo data for development: one public contact form handled by the Secretariat. It shows the
// engine end to end (public page /f/kontakt-demo, inbox, workflow). Skipped when the key exists.
const DEFINITION = {
  title: { sq: "Kontakt (demo)", en: "Contact (demo)" },
  description: {
    sq: "Formular provë për të parë si funksionojnë formularët.",
    en: "A trial form to see how forms work.",
  },
  fields: [
    {
      key: "name",
      type: "text",
      label: { sq: "Emri dhe mbiemri", en: "Full name" },
      required: true,
      max: 100,
    },
    { key: "email", type: "email", label: { sq: "Email", en: "E-mail" }, required: true },
    {
      key: "topic",
      type: "select",
      label: { sq: "Tema", en: "Topic" },
      required: true,
      options: [
        { value: "info", label: { sq: "Informacion", en: "Information" } },
        { value: "other", label: { sq: "Tjetër", en: "Other" } },
      ],
    },
    {
      key: "topicOther",
      type: "text",
      label: { sq: "Cila temë?", en: "Which topic?" },
      required: true,
      showIf: { field: "topic", equals: "other" },
    },
    {
      key: "message",
      type: "textarea",
      label: { sq: "Mesazhi", en: "Message" },
      required: true,
      max: 2000,
    },
  ],
  workflow: {
    initial: "new",
    states: [
      { key: "new", label: { sq: "E re", en: "New" } },
      {
        key: "answered",
        label: { sq: "Përgjigjur", en: "Answered" },
        kind: "approved",
        final: true,
      },
      {
        key: "closed",
        label: { sq: "Mbyllur pa përgjigje", en: "Closed" },
        kind: "rejected",
        final: true,
      },
    ],
    transitions: [
      { from: "new", to: "answered" },
      { from: "new", to: "closed" },
    ],
  },
};

export const pltFormsSeeder: Seeder = {
  name: "plt-forms",
  envs: ["dev", "demo"],
  async run(db) {
    if (await db.formDefinition.findFirst({ where: { key: "kontakt-demo" } })) return;
    await db.formDefinition.create({
      data: {
        key: "kontakt-demo",
        version: 1,
        status: "PUBLISHED",
        audience: "PUBLIC",
        ownerRoles: ["secretary"],
        definition: DEFINITION,
        publishedAt: new Date(),
      },
    });
  },
};
