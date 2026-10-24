import { z } from "zod";

const id = z.string().min(1, "required");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((v) => v || null);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate")
  .nullish()
  .transform((v) => v || null);
const optionalId = z
  .string()
  .nullish()
  .transform((v) => v || null);

export const ARCHIVE_KINDS = ["DIPLOMA_FORM", "DIPLOMA_SUPPLEMENT", "DECISION", "OTHER"] as const;

const fields = {
  title: z.string().trim().min(1, "required").max(200, "tooLong"),
  decisionRef: optionalText(100),
  decisionDate: date,
  notes: optionalText(500),
  templateId: optionalId,
};

/** AC-2 */
export const addDocumentSchema = z.object({
  kind: z.enum(ARCHIVE_KINDS),
  academicYearId: id,
  programId: optionalId,
  fileId: id,
  ...fields,
});
/** AC-3 */
export const updateDocumentSchema = z.object({ documentId: id, ...fields });
/** AC-4 */
export const withdrawDocumentSchema = z.object({
  documentId: id,
  reason: z.string().trim().min(1, "required").max(300, "tooLong"),
});
