import { z } from "zod";

export const MAX_DOCUMENTS = 20;
export const MAX_DOCUMENT_LENGTH = 200;
export const MAX_EXCERPT = 5_000;

const isDay = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
const optionalDay = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isDay(v), "invalidDate");

/**
 * AC-1/AC-2: the notice form. Messages are catalog keys (`adm.errors.*`). The author types the
 * checklist one document per line (the form splits it, blank lines dropped).
 */
export const noticeSchema = z
  .object({
    title: z.string().trim().min(1, "required").max(200, "tooLong"),
    body: z.string().trim().min(1, "required").max(10_000, "tooLong"),
    academicYearId: z.string().min(1, "required"),
    programId: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null)),
    registrationDeadline: z.string().min(1, "required").refine(isDay, "invalidDate"),
    documents: z
      .array(z.string().trim().min(1, "documentEmpty").max(MAX_DOCUMENT_LENGTH, "documentTooLong"))
      .max(MAX_DOCUMENTS, "tooManyDocuments")
      .default([]),
    contractExcerpt: z.string().trim().max(MAX_EXCERPT, "tooLong").default(""),
    showFees: z.boolean().default(true),
    publishDate: optionalDay,
    expiresDate: optionalDay,
    pinned: z.boolean().default(false),
    emailPush: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.publishDate && v.expiresDate && v.expiresDate < v.publishDate)
      ctx.addIssue({ code: "custom", path: ["expiresDate"], message: "expiresBeforePublish" });
  });
export type NoticeFormInput = z.input<typeof noticeSchema>;
export type NoticeInput = z.output<typeof noticeSchema>;

export const noticeIdSchema = z.object({ noticeId: z.string().min(1) });
export const createNoticeSchema = noticeSchema;
export const updateNoticeSchema = noticeSchema.and(noticeIdSchema);

/** One document per line -> checklist (blank lines dropped). */
export const splitDocuments = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
