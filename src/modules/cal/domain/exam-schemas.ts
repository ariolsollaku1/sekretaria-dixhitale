import { z } from "zod";
import { MAX_EXAMINERS, SESSION_TYPES } from "./exam-rules";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");
const minute = z
  .number({ error: "timeRange" })
  .int("timeRange")
  .min(0, "timeRange")
  .max(1440, "timeRange");
const room = z
  .string()
  .trim()
  .max(50, "tooLong")
  .nullish()
  .transform((v) => (v ? v : null));
const note = z
  .string()
  .trim()
  .max(300, "tooLong")
  .nullish()
  .transform((v) => (v ? v : null));

/** AC-1 */
export const sessionSchema = z.object({
  academicYearId: z.string().min(1, "required"),
  type: z.enum(SESSION_TYPES, { error: "required" }),
  startDate: day,
  endDate: day,
});
export type SessionInput = z.infer<typeof sessionSchema>;

export const updateSessionSchema = z.object({
  sessionId: z.string().min(1),
  startDate: day,
  endDate: day,
});
export const publishSessionSchema = z.object({
  sessionId: z.string().min(1),
  published: z.boolean(),
});

/** AC-2 */
export const sittingSchema = z.object({
  sessionId: z.string().min(1, "required"),
  planCourseId: z.string().min(1, "required"),
  date: day,
  startMinute: minute,
  endMinute: minute,
  room,
  note,
  examinerIds: z
    .array(z.string().min(1))
    .max(MAX_EXAMINERS, "tooManyExaminers")
    .refine((v) => new Set(v).size === v.length, "duplicateExaminer"),
});
export type SittingInput = z.infer<typeof sittingSchema>;

export const updateSittingSchema = sittingSchema
  .omit({ sessionId: true, planCourseId: true })
  .extend({ sittingId: z.string().min(1) });
export const removeSittingSchema = z.object({ sittingId: z.string().min(1) });
