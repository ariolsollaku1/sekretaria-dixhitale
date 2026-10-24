// The four form definitions of STU-07 (SRC-037b, SRC-037c). The wording is a proposal (Q-74): the
// sysadmin may publish a new version of any of them in the forms admin without code. Plain data.
import { DEREGISTRATION_HANDLER, RECOGNITION_HANDLER } from "./request-rules";

type L = { sq: string; en: string };
const l = (sq: string, en: string): L => ({ sq, en });

const identity = [
  {
    key: "firstName",
    type: "text",
    label: l("Emri", "First name"),
    required: true,
    max: 100,
  },
  {
    key: "lastName",
    type: "text",
    label: l("Mbiemri", "Last name"),
    required: true,
    max: 100,
  },
  {
    key: "studentNumber",
    type: "text",
    label: l("Numri i studentit", "Student number"),
    required: true,
    max: 20,
  },
  {
    key: "birthDate",
    type: "date",
    label: l("Data e lindjes", "Date of birth"),
    required: true,
  },
  { key: "email", type: "email", label: l("Email", "E-mail"), required: true },
];

const program = {
  key: "program",
  type: "text",
  label: l("Kodi i programit", "Program code"),
  help: l(
    "Vetëm nëse jeni regjistruar në më shumë se një program.",
    "Only if you are enrolled in more than one program.",
  ),
  max: 40,
};

const workflow = {
  initial: "new",
  states: [
    { key: "new", label: l("E re", "New") },
    { key: "review", label: l("Në shqyrtim", "In review") },
    { key: "approved", label: l("Miratuar", "Approved"), kind: "approved", final: true },
    { key: "rejected", label: l("Refuzuar", "Rejected"), kind: "rejected", final: true },
  ],
  transitions: [
    { from: "new", to: "review" },
    { from: "new", to: "approved" },
    { from: "new", to: "rejected" },
    { from: "review", to: "approved" },
    { from: "review", to: "rejected" },
  ],
};

const deregistrationFields = [
  program,
  {
    key: "reason",
    type: "textarea",
    label: l("Arsyeja e kërkesës", "Reason for the request"),
    required: true,
    max: 1000,
  },
  {
    key: "requestedDate",
    type: "date",
    label: l("Data e dëshiruar e çregjistrimit", "Requested date of deregistration"),
    required: true,
  },
  {
    key: "confirm",
    type: "checkbox",
    label: l(
      "Kuptoj që çregjistrimi mbyll studimet e mia në këtë program.",
      "I understand that deregistration ends my studies in this program.",
    ),
    required: true,
  },
];

const recognitionFields = [
  program,
  {
    key: "institution",
    type: "text",
    label: l("Institucioni i mëparshëm", "Previous institution"),
    required: true,
    max: 200,
  },
  {
    key: "studyProgram",
    type: "text",
    label: l("Programi i studimit i mëparshëm", "Previous study program"),
    required: true,
    max: 200,
  },
  {
    key: "courses",
    type: "textarea",
    label: l(
      "Lëndët për njohje (emri dhe kreditet, një për rresht)",
      "Courses to recognize (name and credits, one per line)",
    ),
    required: true,
    max: 3000,
  },
  {
    key: "notes",
    type: "textarea",
    label: l("Shënime", "Notes"),
    max: 2000,
  },
];

const file = {
  key: "document",
  type: "file",
  label: l("Dokumenti (vërtetim notash, programe lëndësh)", "Document (transcript, syllabi)"),
};

const deregTitle = l("Kërkesë për çregjistrim", "Deregistration request");
const recoTitle = l("Kërkesë për njohje dokumentesh", "Document recognition request");
const deregDescription = l(
  "Plotësoni kërkesën për të mbyllur studimet tuaja. Sekretaria do ta shqyrtojë dhe do t'ju njoftojë.",
  "Fill in the request to end your studies. The Secretariat reviews it and will notify you.",
);
const recoDescription = l(
  "Kërkoni njohjen e lëndëve ose dokumenteve të marra më parë. Sekretaria vendos për secilën lëndë.",
  "Ask for earlier courses or documents to be recognized. The Secretariat decides per course.",
);

export type RequestFormSeed = {
  key: string;
  audience: "PUBLIC" | "AUTHENTICATED";
  ownerRoles: ("secretary" | "student_affairs")[];
  definition: Record<string, unknown>;
};

const owners: RequestFormSeed["ownerRoles"] = ["secretary", "student_affairs"];

export const REQUEST_FORMS: RequestFormSeed[] = [
  {
    key: "deregistration",
    audience: "PUBLIC",
    ownerRoles: owners,
    definition: {
      title: deregTitle,
      description: deregDescription,
      fields: [...identity, ...deregistrationFields],
      workflow,
      handler: DEREGISTRATION_HANDLER,
    },
  },
  {
    key: "deregistration-student",
    audience: "AUTHENTICATED",
    ownerRoles: owners,
    definition: {
      title: deregTitle,
      description: deregDescription,
      fields: deregistrationFields,
      workflow,
      handler: DEREGISTRATION_HANDLER,
    },
  },
  {
    key: "recognition",
    audience: "PUBLIC",
    ownerRoles: owners,
    definition: {
      title: recoTitle,
      description: recoDescription,
      fields: [...identity, ...recognitionFields],
      workflow,
      handler: RECOGNITION_HANDLER,
    },
  },
  {
    key: "recognition-student",
    audience: "AUTHENTICATED",
    ownerRoles: owners,
    definition: {
      title: recoTitle,
      description: recoDescription,
      fields: [...recognitionFields, file],
      workflow,
      handler: RECOGNITION_HANDLER,
    },
  },
];
