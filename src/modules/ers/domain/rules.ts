// Pure rules of the Erasmus applications (ERS-01). No I/O.

export const APPLICANT_KINDS = ["student", "academic", "admin"] as const;
export type ApplicantKind = (typeof APPLICANT_KINDS)[number];

/** The six form keys: a public and an in-portal variant per applicant kind (AC-1). */
export const ERASMUS_FORM_KEYS = APPLICANT_KINDS.flatMap((k) => [
  `erasmus-${k}`,
  `erasmus-${k}-portal`,
]);

export const ERASMUS_STATES = [
  "submitted",
  "shortlisted",
  "selected",
  "mobility_done",
  "rejected",
] as const;

/** AC-4: the applicant kind of an Erasmus form key, or null for any other form. */
export function applicantKind(formKey: string): ApplicantKind | null {
  const m = /^erasmus-(student|academic|admin)(-portal)?$/.exec(formKey);
  return m ? (m[1] as ApplicantKind) : null;
}

/** The form keys of one applicant kind (public and in-portal). */
export const formKeysOf = (kind: ApplicantKind): string[] => [
  `erasmus-${kind}`,
  `erasmus-${kind}-portal`,
];

const str = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** AC-4: the period as the officer reads it: dates for staff, term (and year) for students. */
export function periodOf(
  kind: ApplicantKind,
  answers: Record<string, unknown>,
  termLabel: (term: string) => string,
): string {
  if (kind === "student") {
    const term = str(answers.period, 40);
    const year = str(answers.academicYear, 20);
    return [term ? termLabel(term) : "", year].filter(Boolean).join(" ");
  }
  const from = str(answers.startDate, 10);
  const to = str(answers.endDate, 10);
  return from || to ? `${from} – ${to}` : "";
}

/** AC-4: name as given in a public form (empty for signed-in forms; the submitter is used then). */
export const nameOf = (answers: Record<string, unknown>): string =>
  [str(answers.firstName, 100), str(answers.lastName, 100)].filter(Boolean).join(" ");

/** AC-5 (Q-96): both the student number and the date of birth must equal the record's. */
export function studentIdentityMatches(
  given: { studentNumber?: unknown; birthDate?: unknown },
  record: { studentNumber: string; birthDate: string },
): boolean {
  return (
    str(given.studentNumber, 20) !== "" &&
    str(given.studentNumber, 20) === record.studentNumber &&
    str(given.birthDate, 10) === record.birthDate
  );
}

export const emailKey = (v: unknown): string => str(v, 254).toLowerCase();
