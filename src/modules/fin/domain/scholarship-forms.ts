// The two scholarship application forms of FIN-03 (SRC-037a): public and in-portal. The wording
// and fields are a proposal (Q-142): the sysadmin may publish a new version in the forms admin
// without code. Plain data, validated by the PLT-15 schema in a test.
import { SCHOLARSHIP_HANDLER } from "./scholarship-rules";

type L = { sq: string; en: string };
const l = (sq: string, en: string): L => ({ sq, en });

const identity = [
  { key: "firstName", type: "text", label: l("Emri", "First name"), required: true, max: 100 },
  { key: "lastName", type: "text", label: l("Mbiemri", "Last name"), required: true, max: 100 },
  {
    key: "studentNumber",
    type: "text",
    label: l("Numri i studentit", "Student number"),
    required: true,
    max: 20,
  },
  { key: "birthDate", type: "date", label: l("Data e lindjes", "Date of birth"), required: true },
  { key: "email", type: "email", label: l("Email", "E-mail"), required: true },
];

const applicationFields = [
  {
    key: "program",
    type: "text",
    label: l("Kodi i programit", "Program code"),
    help: l(
      "Vetëm nëse jeni regjistruar në më shumë se një program.",
      "Only if you are enrolled in more than one program.",
    ),
    max: 40,
  },
  {
    key: "academicYear",
    type: "text",
    label: l("Viti akademik për të cilin kërkoni bursën", "Academic year the scholarship is for"),
    required: true,
    max: 20,
  },
  {
    key: "category",
    type: "select",
    label: l("Lloji i bursës", "Kind of scholarship"),
    required: true,
    options: [
      { value: "EXCELLENCE", label: l("Për student të shkëlqyer", "Excellent student") },
      { value: "NEED", label: l("Për student në nevojë", "Student in need") },
      {
        value: "DISABILITY",
        label: l("Për student me aftësi të kufizuara", "Student with disability"),
      },
      { value: "OTHER", label: l("Tjetër", "Other") },
    ],
  },
  {
    key: "averageGrade",
    type: "number",
    label: l(
      "Mesatarja e notave (për bursë shkëlqimi)",
      "Average grade (for an excellence scholarship)",
    ),
    min: 1,
    max: 10,
  },
  {
    key: "motivation",
    type: "textarea",
    label: l("Arsyet e kërkesës", "Reasons for the request"),
    required: true,
    max: 3000,
  },
  {
    key: "confirm",
    type: "checkbox",
    label: l(
      "Deklaroj që të dhënat e mësipërme janë të vërteta.",
      "I declare that the information above is true.",
    ),
    required: true,
  },
];

const file = {
  key: "document",
  type: "file",
  label: l("Dokument shoqërues (opsional)", "Supporting document (optional)"),
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

const title = l("Kërkesë për bursë", "Scholarship application");
const description = l(
  "Plotësoni kërkesën për bursë të plotë ose të pjesshme. Financa vendos dhe do t'ju njoftojë.",
  "Apply for a full or partial scholarship. Finance decides and will notify you.",
);

export type ScholarshipFormSeed = {
  key: string;
  audience: "PUBLIC" | "AUTHENTICATED";
  ownerRoles: "finance"[];
  definition: Record<string, unknown>;
};

export const SCHOLARSHIP_FORMS: ScholarshipFormSeed[] = [
  {
    key: "scholarship",
    audience: "PUBLIC",
    ownerRoles: ["finance"],
    definition: {
      title,
      description,
      fields: [...identity, ...applicationFields],
      workflow,
      handler: SCHOLARSHIP_HANDLER,
    },
  },
  {
    key: "scholarship-student",
    audience: "AUTHENTICATED",
    ownerRoles: ["finance"],
    definition: {
      title,
      description,
      fields: [...applicationFields, file],
      workflow,
      handler: SCHOLARSHIP_HANDLER,
    },
  },
];
