import { z } from "zod";
import { birthDateInRange, isDay, personFields } from "@/lib/people/schema";
import { NIM_MAX, normalizeNim, validNim } from "./student-rules";

export const REGISTRATION_TYPES = ["FIRST_TIME", "SECOND_PROGRAM", "TRANSFER"] as const;

const nim = z
  .string()
  .nullish()
  .transform((v) => normalizeNim(v))
  .refine((v) => v === null || validNim(v), { message: "nimInvalid" })
  .refine((v) => v === null || v.length <= NIM_MAX, { message: "tooLong" });

const day = z.string().refine(isDay, "invalidDate");

/** AC-1/AC-6: personal data and NIM; one schema for the form and the actions. */
export const personalSchema = z.object({ ...personFields, nim }).superRefine((v, ctx) => {
  if (isDay(v.birthDate) && !birthDateInRange(v.birthDate))
    ctx.addIssue({ code: "custom", path: ["birthDate"], message: "birthDateRange" });
});
export type PersonalInput = z.infer<typeof personalSchema>;
export type PersonalFormInput = z.input<typeof personalSchema>;

/** AC-2/AC-4 */
export const enrollmentSchema = z.object({
  programId: z.string().min(1, "required"),
  cohortId: z.string().min(1, "required"),
  registrationType: z.enum(REGISTRATION_TYPES),
  startedAt: day,
});
export type EnrollmentInput = z.infer<typeof enrollmentSchema>;

/** AC-5: personal data and, optionally, the first enrollment. */
export const registerStudentSchema = personalSchema.and(
  z.object({ enrollment: enrollmentSchema.nullish().transform((v) => v ?? null) }),
);
export const updateStudentSchema = personalSchema.and(z.object({ studentId: z.string().min(1) }));
export const addEnrollmentSchema = enrollmentSchema.extend({ studentId: z.string().min(1) });

/** AC-7/AC-8 */
export const yearRegistrationSchema = z.object({
  enrollmentId: z.string().min(1),
  academicYearId: z.string().min(1, "required"),
  yearOfStudy: z.number({ error: "yearOutOfRange" }).int("yearOutOfRange").min(1, "yearOutOfRange"),
  groupId: z.string().min(1, "required"),
});
export type YearRegistrationInput = z.infer<typeof yearRegistrationSchema>;
export const changeGroupSchema = z.object({
  yearRegistrationId: z.string().min(1),
  groupId: z.string().min(1, "required"),
});
