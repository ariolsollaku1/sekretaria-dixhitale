import { z } from "zod";
import { MAX_CREDITS, MAX_HOURS } from "./course-rules";

const whole = (max: number, message: string) =>
  z.number({ error: message }).int(message).min(0, message).max(max, message);

const notes = z
  .string()
  .trim()
  .max(2000, "tooLong")
  .nullish()
  .transform((v) => (v ? v : null));

/** AC-6 */
export const createPlanSchema = z.object({
  programId: z.string().min(1),
  validFromAcademicYearId: z.string().min(1, "required"),
  copyFromPlanId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
  notes,
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z.object({
  planId: z.string().min(1),
  validFromAcademicYearId: z.string().min(1, "required"),
  notes,
});

export const planIdSchema = z.object({ planId: z.string().min(1) });

/**
 * AC-2: credits, category and hours are optional when adding — an absent value means "take the
 * catalog's"; `categoryId: null` means "no category".
 */
export const addPlanCourseSchema = z.object({
  planId: z.string().min(1),
  courseId: z.string().min(1, "required"),
  yearOfStudy: z.number().int().min(1, "yearOutOfRange"),
  semester: z.number().int().min(1, "semesterOutOfRange").max(2, "semesterOutOfRange"),
  credits: whole(MAX_CREDITS, "creditsRange").optional(),
  categoryId: z.string().nullish(),
  hoursLecture: whole(MAX_HOURS, "hoursRange").optional(),
  hoursSeminar: whole(MAX_HOURS, "hoursRange").optional(),
  hoursLab: whole(MAX_HOURS, "hoursRange").optional(),
  isElective: z.boolean().default(false),
});
export type AddPlanCourseInput = z.infer<typeof addPlanCourseSchema>;

export const updatePlanCourseSchema = z.object({
  planCourseId: z.string().min(1),
  yearOfStudy: z.number().int().min(1, "yearOutOfRange"),
  semester: z.number().int().min(1, "semesterOutOfRange").max(2, "semesterOutOfRange"),
  credits: whole(MAX_CREDITS, "creditsRange"),
  categoryId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
  hoursLecture: whole(MAX_HOURS, "hoursRange"),
  hoursSeminar: whole(MAX_HOURS, "hoursRange"),
  hoursLab: whole(MAX_HOURS, "hoursRange"),
  isElective: z.boolean(),
});
export type UpdatePlanCourseInput = z.infer<typeof updatePlanCourseSchema>;

export const removePlanCourseSchema = z.object({ planCourseId: z.string().min(1) });
