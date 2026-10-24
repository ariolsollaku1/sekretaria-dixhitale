// The public interest form (SRC-030, SRC-031). The wording is a proposal (Q-135): the sysadmin may
// publish a new version in the forms admin without code; the handler key and the field keys that
// the handler reads (firstName, lastName, email, phone, program, message, consent) must stay.
// Plain data, no imports with side effects.
import { INTEREST_HANDLER } from "./lead-rules";

type L = { sq: string; en: string };
const l = (sq: string, en: string): L => ({ sq, en });

export const INTEREST_FORM = {
  key: "interest",
  audience: "PUBLIC" as const,
  ownerRoles: ["secretary", "student_affairs"] as const,
  definition: {
    title: l("Formular interesimi", "Interest form"),
    description: l(
      "Lini të dhënat tuaja dhe do t'ju kontaktojmë me informacion për studimet në Kolegjin LOGOS.",
      "Leave your details and we will contact you with information about studying at LOGOS.",
    ),
    fields: [
      { key: "firstName", type: "text", label: l("Emri", "First name"), required: true, max: 100 },
      {
        key: "lastName",
        type: "text",
        label: l("Mbiemri", "Last name"),
        required: true,
        max: 100,
      },
      { key: "email", type: "email", label: l("Email", "E-mail"), required: true },
      { key: "phone", type: "phone", label: l("Telefoni", "Phone") },
      {
        key: "program",
        type: "text",
        label: l("Programi i interesit", "Program of interest"),
        help: l(
          "Kodi ose emri i programit, nëse e dini.",
          "The program code or name, if you know it.",
        ),
        max: 200,
      },
      {
        key: "message",
        type: "textarea",
        label: l("Mesazhi (opsional)", "Message (optional)"),
        max: 2000,
      },
      {
        key: "consent",
        type: "checkbox",
        label: l(
          "Jam dakord që LOGOS të më kontaktojë për studimet",
          "I agree that LOGOS contacts me about studies",
        ),
        required: true,
      },
    ],
    workflow: {
      initial: "new",
      states: [
        { key: "new", label: l("E re", "New") },
        { key: "processed", label: l("Përpunuar", "Processed"), final: true },
      ],
      transitions: [{ from: "new", to: "processed" }],
    },
    handler: INTEREST_HANDLER,
  },
};
