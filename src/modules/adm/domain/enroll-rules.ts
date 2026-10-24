// Pure rules of the enrollment of applications (ADM-04). No I/O: unit-tested.
import { missingRequired, type CycleDocumentType } from "./application-rules";

/** Q-145: statuses that may be enrolled until ADM-03 narrows this to ACCEPTED. */
export const ENROLLABLE_STATUSES = ["SUBMITTED", "IN_REVIEW", "ACCEPTED"] as const;
/** AC-7 */
export const BULK_MAX = 100;
export const REGISTRATION_TYPES = ["FIRST_TIME", "SECOND_PROGRAM", "TRANSFER"] as const;
export type RegistrationType = (typeof REGISTRATION_TYPES)[number];

export const isEnrollable = (status: string): boolean =>
  (ENROLLABLE_STATUSES as readonly string[]).includes(status);

export type EnrollBlocker = "alreadyEnrolled" | "notEnrollable" | "documentsMissing";

/** AC-3, AC-5: why an application cannot be enrolled now (null = it can). */
export function enrollBlocker(input: {
  status: string;
  documentTypes: readonly CycleDocumentType[];
  uploadedKeys: readonly string[];
  allowMissingDocuments: boolean;
}): EnrollBlocker | null {
  if (input.status === "ENROLLED") return "alreadyEnrolled";
  if (!isEnrollable(input.status)) return "notEnrollable";
  if (
    !input.allowMissingDocuments &&
    missingRequired(input.documentTypes, input.uploadedKeys).length > 0
  )
    return "documentsMissing";
  return null;
}

/** AC-4: a known student cannot be registered "first time" again. */
export const typeAllowed = (type: RegistrationType, knownStudent: boolean): boolean =>
  !(knownStudent && type === "FIRST_TIME");

type ApplicationPerson = {
  firstName: string;
  lastName: string;
  fatherName: string | null;
  gender: "FEMALE" | "MALE";
  birthDate: string;
  birthPlace: string | null;
  nationalId: string | null;
  email: string;
  phone: string;
  address: string;
  residence: string | null;
};

/** Q-146, AC-7: the personal data of an application as the form for STU-01 (no NIM yet). */
export const personDraft = (a: ApplicationPerson) => ({
  firstName: a.firstName,
  lastName: a.lastName,
  fatherName: a.fatherName,
  gender: a.gender,
  birthDate: a.birthDate,
  birthPlace: a.birthPlace,
  nationalId: a.nationalId,
  email: a.email,
  phone: a.phone,
  address: a.address,
  residence: a.residence,
  nim: null as string | null,
});
