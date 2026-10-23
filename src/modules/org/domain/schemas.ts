import { z } from "zod";
import { isDay } from "./year-rules";

const day = z.string().refine(isDay, "invalidDate");
const range = z.object({ start: day, end: day });

/** One schema for the form and the server actions (conventions.md). Messages are catalog keys. */
export const yearSchema = z.object({
  startDate: day,
  endDate: day,
  semester1: range,
  semester2: range,
});
export type YearFormInput = z.infer<typeof yearSchema>;

export const updateYearSchema = yearSchema.extend({ yearId: z.string().min(1) });
export const makeCurrentSchema = z.object({ yearId: z.string().min(1) });

// ---- faculties and departments (ORG-02) ------------------------------------------------------
import { validateCode } from "./unit-rules";

const code = z.string().transform((v, ctx) => {
  const check = validateCode(v);
  if (!check.ok) {
    ctx.addIssue({ code: "custom", message: check.reason });
    return z.NEVER;
  }
  return check.code;
});
const name = z.string().trim().min(1, "required").max(150);
const nameEn = z
  .string()
  .trim()
  .max(150)
  .nullish()
  .transform((v) => (v ? v : null));

export const facultySchema = z.object({ code, name, nameEn });
export type FacultyFormInput = z.input<typeof facultySchema>;
export const updateFacultySchema = facultySchema.extend({ facultyId: z.string().min(1) });

export const departmentSchema = facultySchema.extend({ facultyId: z.string().min(1) });
export type DepartmentFormInput = z.input<typeof departmentSchema>;
/** The faculty of a department is fixed after creation, so the update schema has no facultyId. */
export const updateDepartmentSchema = facultySchema.extend({ departmentId: z.string().min(1) });

export const unitIdSchema = z.object({ id: z.string().min(1) });
