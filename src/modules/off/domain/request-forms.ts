// The four staff request form definitions of OFF-01 (SRC-140). The wording, fields and chain are a
// proposal (Q-100..Q-102): the sysadmin may publish a new version of any of them in the forms admin
// without code. Plain data.
import { REQUEST_HANDLER } from "./request-rules";

type L = { sq: string; en: string };
const l = (sq: string, en: string): L => ({ sq, en });

type StaffRole = "head_of_department" | "administration";

/** Every role except the student (staff self-service, roles.md). */
const SUBMIT_ROLES = [
  "sysadmin",
  "secretary",
  "student_affairs",
  "lecturer",
  "finance",
  "hr",
  "quality",
  "library",
  "administration",
  "head_of_department",
  "program_coordinator",
  "erasmus",
];

const states = {
  new: { key: "new", label: l("E re", "New") },
  supervisor: {
    key: "supervisor_approved",
    label: l("Miratuar nga eprori", "Approved by supervisor"),
  },
  progress: { key: "in_progress", label: l("Në proces", "In progress") },
  rejected: { key: "rejected", label: l("Refuzuar", "Rejected"), kind: "rejected", final: true },
};
const approved = (sq: string, en: string) => ({
  key: "approved",
  label: l(sq, en),
  kind: "approved",
  final: true,
});

const hod: StaffRole[] = ["head_of_department"];
const admin: StaffRole[] = ["administration"];

/** AC-4: supervisor first, then administration; administration may also decide at once (Q-101). */
const supervisedWorkflow = {
  initial: "new",
  states: [states.new, states.supervisor, approved("Miratuar", "Approved"), { ...states.rejected }],
  transitions: [
    { from: "new", to: "supervisor_approved", roles: hod },
    { from: "new", to: "approved", roles: admin },
    { from: "new", to: "rejected", roles: [...hod, ...admin] },
    { from: "supervisor_approved", to: "approved", roles: admin },
    { from: "supervisor_approved", to: "rejected", roles: admin },
  ],
};

/** AC-4: administration alone. */
const officeWorkflow = (doneSq: string, doneEn: string) => ({
  initial: "new",
  states: [states.new, states.progress, approved(doneSq, doneEn), { ...states.rejected }],
  transitions: [
    { from: "new", to: "in_progress", roles: admin },
    { from: "new", to: "approved", roles: admin },
    { from: "new", to: "rejected", roles: admin },
    { from: "in_progress", to: "approved", roles: admin },
    { from: "in_progress", to: "rejected", roles: admin },
  ],
});

const leaveFields = [
  {
    key: "leaveType",
    type: "select",
    label: l("Lloji i lejes", "Type of leave"),
    required: true,
    options: [
      { value: "annual", label: l("Pushim vjetor", "Annual leave") },
      { value: "sick", label: l("Leje mjekësore", "Sick leave") },
      { value: "unpaid", label: l("Leje pa pagesë", "Unpaid leave") },
      { value: "other", label: l("Tjetër", "Other") },
    ],
  },
  { key: "startDate", type: "date", label: l("Nga data", "From"), required: true },
  { key: "endDate", type: "date", label: l("Deri më datë", "Until"), required: true },
  { key: "reason", type: "textarea", label: l("Arsyeja", "Reason"), max: 1000 },
];

const suppliesFields = [
  {
    key: "items",
    type: "textarea",
    label: l("Artikujt dhe sasitë (një për rresht)", "Items and quantities (one per line)"),
    required: true,
    max: 2000,
  },
  { key: "neededBy", type: "date", label: l("Nevojiten deri më", "Needed by") },
  { key: "notes", type: "textarea", label: l("Shënime", "Notes"), max: 1000 },
];

const certificateFields = [
  {
    key: "purpose",
    type: "text",
    label: l("Qëllimi i vërtetimit", "Purpose of the certificate"),
    required: true,
    max: 200,
  },
  {
    key: "recipient",
    type: "text",
    label: l("Institucioni marrës", "Recipient institution"),
    max: 200,
  },
  {
    key: "copies",
    type: "number",
    label: l("Numri i kopjeve", "Number of copies"),
    required: true,
    integer: true,
    min: 1,
    max: 10,
  },
  { key: "notes", type: "textarea", label: l("Shënime", "Notes"), max: 1000 },
];

const authorizationFields = [
  {
    key: "subject",
    type: "text",
    label: l("Objekti i autorizimit", "Subject of the authorization"),
    required: true,
    max: 200,
  },
  {
    key: "description",
    type: "textarea",
    label: l("Përshkrimi", "Description"),
    required: true,
    max: 2000,
  },
  { key: "validFrom", type: "date", label: l("E vlefshme nga", "Valid from"), required: true },
  { key: "validTo", type: "date", label: l("E vlefshme deri", "Valid until") },
];

export type StaffFormSeed = {
  key: string;
  audience: "AUTHENTICATED";
  ownerRoles: StaffRole[];
  definition: Record<string, unknown>;
};

const make = (
  key: string,
  ownerRoles: StaffRole[],
  title: L,
  description: L,
  fields: unknown[],
  workflow: unknown,
): StaffFormSeed => ({
  key,
  audience: "AUTHENTICATED",
  ownerRoles,
  definition: {
    title,
    description,
    fields,
    workflow,
    submitRoles: SUBMIT_ROLES,
    handler: REQUEST_HANDLER,
  },
});

export const STAFF_FORMS: StaffFormSeed[] = [
  make(
    "staff-leave",
    [...hod, ...admin],
    l("Kërkesë për leje", "Leave request"),
    l(
      "Kërkoni pushim ose leje. Eprori dhe administrata e shqyrtojnë dhe ju njoftojnë.",
      "Ask for leave. Your supervisor and the administration review it and notify you.",
    ),
    leaveFields,
    supervisedWorkflow,
  ),
  make(
    "staff-supplies",
    admin,
    l("Kërkesë për materiale kancelarie", "Office supplies request"),
    l(
      "Kërkoni materiale kancelarie. Administrata i përgatit dhe ju njofton.",
      "Ask for office supplies. The administration prepares them and notifies you.",
    ),
    suppliesFields,
    officeWorkflow("Përmbushur", "Fulfilled"),
  ),
  make(
    "staff-certificate",
    admin,
    l("Kërkesë për vërtetim pune", "Employment certificate request"),
    l(
      "Kërkoni një vërtetim që jeni punonjës i kolegjit.",
      "Ask for a certificate of employment at the college.",
    ),
    certificateFields,
    officeWorkflow("Lëshuar", "Issued"),
  ),
  make(
    "staff-authorization",
    [...hod, ...admin],
    l("Kërkesë për autorizim", "Authorization request"),
    l(
      "Kërkoni një autorizim. Eprori dhe administrata e shqyrtojnë dhe ju njoftojnë.",
      "Ask for an authorization. Your supervisor and the administration review it and notify you.",
    ),
    authorizationFields,
    supervisedWorkflow,
  ),
];
