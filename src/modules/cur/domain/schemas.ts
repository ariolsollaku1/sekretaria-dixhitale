import { z } from "zod";
import { MAX_CREDITS, MAX_HOURS, validateCategoryCode, validateCourseCode } from "./course-rules";

const courseCode = z.string().transform((v, ctx) => {
  const r = validateCourseCode(v);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.reason });
    return z.NEVER;
  }
  return r.code;
});
const categoryCode = z.string().transform((v, ctx) => {
  const r = validateCategoryCode(v);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.reason });
    return z.NEVER;
  }
  return r.code;
});

const hours = z.coerce.number().int("hoursRange").min(0, "hoursRange").max(MAX_HOURS, "hoursRange");

export const courseSchema = z.object({
  code: courseCode,
  name: z.string().trim().min(1, "required").max(200),
  nameEn: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => (v ? v : null)),
  defaultCredits: z.coerce
    .number()
    .int("creditsRange")
    .min(0, "creditsRange")
    .max(MAX_CREDITS, "creditsRange"),
  categoryId: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null)),
  hoursLecture: hours.default(0),
  hoursSeminar: hours.default(0),
  hoursLab: hours.default(0),
  departmentId: z.string().min(1, "required"),
});
export type CourseInput = z.output<typeof courseSchema>;
export type CourseFormInput = z.input<typeof courseSchema>;
export const updateCourseSchema = courseSchema.extend({ courseId: z.string().min(1) });

export const categorySchema = z.object({
  code: categoryCode,
  nameSq: z.string().trim().min(1, "required").max(100),
  nameEn: z.string().trim().min(1, "required").max(100),
});
export const updateCategorySchema = categorySchema.extend({ categoryId: z.string().min(1) });

export const idSchema = z.object({ id: z.string().min(1) });
