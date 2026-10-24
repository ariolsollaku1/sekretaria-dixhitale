import { z } from "zod";
import { birthDateOk, gradeOk, todayInTirane } from "./application-rules";

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

// Messages are catalog keys under `adm.errors.*`.
const required = (max: number) => z.string().trim().min(1, "required").max(max, "tooLong");
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((v) => (v ? v : null));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");

export const HONEYPOT_FIELD = "hp_note";

/** AC-3, AC-4: what the public form sends. */
export const applicationSchema = z.object({
  cycleId: z.string().min(1, "required"),
  programId: z.string().min(1, "required"),
  locale: z.enum(["sq", "en"]).default("sq"),
  firstName: required(100),
  lastName: required(100),
  fatherName: optional(100),
  gender: z.enum(["FEMALE", "MALE"], { error: "required" }),
  birthDate: day.refine((v) => birthDateOk(v, todayInTirane()), "invalidBirthDate"),
  birthPlace: optional(100),
  nationalId: z
    .string()
    .trim()
    .max(30, "tooLong")
    .nullish()
    .transform((v) => (v ? v.toUpperCase() : null)),
  email: z
    .string()
    .trim()
    .max(200, "tooLong")
    .refine((v) => z.email().safeParse(v).success, "invalidEmail"),
  phone: required(40),
  address: required(300),
  residence: optional(100),
  schoolName: required(200),
  schoolCity: optional(100),
  graduationYear: z.coerce
    .number({ error: "invalidYear" })
    .int("invalidYear")
    .min(1950, "invalidYear")
    .max(new Date().getUTCFullYear() + 1, "invalidYear"),
  averageGrade: z
    .string({ error: "invalidGrade" })
    .trim()
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => Number.isFinite(v) && gradeOk(v), "invalidGrade"),
  consent: z.literal(true, { error: "consentRequired" }),
});
export type ApplicationInput = z.output<typeof applicationSchema>;

export const linkRequestSchema = z.object({
  reference: z.string().trim().min(1, "required").max(30, "tooLong"),
  email: z.string().trim().min(1, "required").max(200, "tooLong"),
});

const cycleDocument = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,39}$/, "invalidKey"),
  labelSq: required(120),
  labelEn: optional(120),
  required: z.boolean(),
});

/** AC-1 */
export const cycleSchema = z
  .object({
    cycleId: z.string().min(1).nullish(),
    academicYearId: z.string().min(1, "required"),
    name: required(80),
    opensOn: day,
    closesOn: day,
    active: z.boolean(),
    documents: z.array(cycleDocument).max(20, "tooMany"),
  })
  .superRefine((v, ctx) => {
    if (v.closesOn < v.opensOn)
      ctx.addIssue({ code: "custom", path: ["closesOn"], message: "windowOrder" });
    const seen = new Set<string>();
    v.documents.forEach((d, i) => {
      if (seen.has(d.key))
        ctx.addIssue({ code: "custom", path: ["documents", i, "key"], message: "duplicateKey" });
      seen.add(d.key);
    });
  });
export type CycleInput = z.output<typeof cycleSchema>;
