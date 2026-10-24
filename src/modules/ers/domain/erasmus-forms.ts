// The six Erasmus application forms (SRC-037f, SRC-130..133). The wording and fields are a
// proposal (Q-95): the sysadmin may publish a new version of any of them in the forms admin without
// code. Plain data, validated by the PLT-15 schema in a test.

type L = { sq: string; en: string };
const l = (sq: string, en: string): L => ({ sq, en });
const opt = (value: string, sq: string, en: string) => ({ value, label: l(sq, en) });

const identity = [
  { key: "firstName", type: "text", label: l("Emri", "First name"), required: true, max: 100 },
  { key: "lastName", type: "text", label: l("Mbiemri", "Last name"), required: true, max: 100 },
  { key: "email", type: "email", label: l("Email", "E-mail"), required: true },
  { key: "phone", type: "phone", label: l("Telefoni", "Phone") },
];

const studentIdentity = [
  ...identity,
  { key: "birthDate", type: "date", label: l("Data e lindjes", "Date of birth") },
  {
    key: "studentNumber",
    type: "text",
    label: l("Numri i studentit", "Student number"),
    help: l(
      "Nëse jeni student i LOGOS, shkruani numrin dhe datën e lindjes për t'u njohur.",
      "If you are a LOGOS student, give your number and date of birth so we recognize you.",
    ),
    max: 20,
  },
];

const mobilityDetails = (types: ReturnType<typeof opt>[]) => [
  {
    key: "destination",
    type: "text",
    label: l("Institucioni pritës", "Host institution"),
    required: true,
    max: 200,
  },
  {
    key: "mobilityType",
    type: "select",
    label: l("Lloji i mobilitetit", "Mobility type"),
    required: true,
    options: types,
  },
];

const studentFields = [
  {
    key: "program",
    type: "text",
    label: l("Programi i studimit", "Study program"),
    required: true,
    max: 200,
  },
  {
    key: "yearOfStudy",
    type: "number",
    label: l("Viti i studimit", "Year of study"),
    required: true,
    min: 1,
    max: 8,
    integer: true,
  },
  ...mobilityDetails([
    opt("study", "Studim", "Study"),
    opt("traineeship", "Praktikë", "Traineeship"),
  ]),
  {
    key: "period",
    type: "select",
    label: l("Periudha", "Period"),
    required: true,
    options: [
      opt("autumn", "Semestri i vjeshtës", "Autumn semester"),
      opt("spring", "Semestri i pranverës", "Spring semester"),
      opt("year", "Viti i plotë", "Full year"),
    ],
  },
  {
    key: "academicYear",
    type: "text",
    label: l("Viti akademik (p.sh. 2027/2028)", "Academic year (e.g. 2027/2028)"),
    required: true,
    max: 20,
  },
  {
    key: "languageLevel",
    type: "text",
    label: l("Niveli i gjuhës së huaj", "Foreign-language level"),
    max: 100,
  },
];

const staffFields = (unitKey: "department" | "unit") => [
  {
    key: unitKey,
    type: "text",
    label:
      unitKey === "department"
        ? l("Departamenti", "Department")
        : l("Zyra / sektori", "Office / unit"),
    required: true,
    max: 200,
  },
  { key: "position", type: "text", label: l("Pozicioni", "Position"), required: true, max: 200 },
  ...mobilityDetails([
    opt("teaching", "Mësimdhënie", "Teaching"),
    opt("training", "Trajnim", "Training"),
  ]),
  { key: "startDate", type: "date", label: l("Data e fillimit", "Start date"), required: true },
  { key: "endDate", type: "date", label: l("Data e mbarimit", "End date"), required: true },
];

const closing = [
  {
    key: "motivation",
    type: "textarea",
    label: l("Motivimi", "Motivation"),
    required: true,
    max: 3000,
  },
  {
    key: "confirm",
    type: "checkbox",
    label: l(
      "Deklaroj që të dhënat janë të vërteta.",
      "I declare that the information is correct.",
    ),
    required: true,
  },
];

const letter = {
  key: "letter",
  type: "file",
  label: l("Letra e motivimit ose CV (opsionale)", "Motivation letter or CV (optional)"),
};

const workflow = {
  initial: "submitted",
  states: [
    { key: "submitted", label: l("Dërguar", "Submitted") },
    { key: "shortlisted", label: l("Në listën e ngushtë", "Shortlisted") },
    { key: "selected", label: l("Përzgjedhur", "Selected") },
    { key: "mobility_done", label: l("Mobiliteti përfunduar", "Mobility done"), final: true },
    { key: "rejected", label: l("Refuzuar", "Rejected"), kind: "rejected", final: true },
  ],
  transitions: [
    { from: "submitted", to: "shortlisted" },
    { from: "submitted", to: "selected" },
    { from: "submitted", to: "rejected" },
    { from: "shortlisted", to: "selected" },
    { from: "shortlisted", to: "rejected" },
    { from: "selected", to: "mobility_done" },
    { from: "selected", to: "rejected" },
  ],
};

const titles = {
  student: l("Aplikim Erasmus për studentë", "Erasmus application for students"),
  academic: l("Aplikim Erasmus për stafin akademik", "Erasmus application for academic staff"),
  admin: l(
    "Aplikim Erasmus për stafin administrativ",
    "Erasmus application for administrative staff",
  ),
};
const description = l(
  "Plotësoni aplikimin për mobilitet Erasmus. Zyra Erasmus do ta shqyrtojë.",
  "Fill in your Erasmus mobility application. The Erasmus Office will review it.",
);

export type ErasmusFormSeed = {
  key: string;
  audience: "PUBLIC" | "AUTHENTICATED";
  ownerRoles: "erasmus"[];
  definition: Record<string, unknown>;
};

const body = {
  student: studentFields,
  academic: staffFields("department"),
  admin: staffFields("unit"),
};

function make(kind: "student" | "academic" | "admin", portal: boolean): ErasmusFormSeed {
  const head = portal ? [] : kind === "student" ? studentIdentity : identity;
  return {
    key: portal ? `erasmus-${kind}-portal` : `erasmus-${kind}`,
    audience: portal ? "AUTHENTICATED" : "PUBLIC",
    ownerRoles: ["erasmus"],
    definition: {
      title: titles[kind],
      description,
      fields: [...head, ...body[kind], ...closing, ...(portal ? [letter] : [])],
      workflow,
    },
  };
}

export const ERASMUS_FORMS: ErasmusFormSeed[] = (["student", "academic", "admin"] as const).flatMap(
  (k) => [make(k, false), make(k, true)],
);
