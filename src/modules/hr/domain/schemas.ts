import { z } from "zod";

export const GENDERS = ["FEMALE", "MALE"] as const;
export const KINDS = ["ACADEMIC", "ADMINISTRATIVE"] as const;
export const CATEGORIES = ["PAE", "PAK", "VOLUNTEER"] as const;

export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const day = z.string().refine(isDay, "invalidDate");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((v) => (v ? v : null));
const required = (max: number) => z.string().trim().min(1, "required").max(max, "tooLong");

/** AC-1/AC-2/AC-4: one schema for the form, the actions and the import. Messages are catalog keys (`hr.errors.*`). */
export const staffSchema = z
  .object({
    firstName: required(100),
    lastName: required(100),
    fatherName: text(100),
    gender: z.enum(GENDERS),
    birthDate: day,
    nationalId: z
      .string()
      .trim()
      .max(30, "tooLong")
      .nullish()
      .transform((v) => (v ? v.toUpperCase() : null)),
    phone: text(40),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(200, "tooLong")
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.email().safeParse(v).success, "invalidEmail"),
    address: text(300),
    kind: z.enum(KINDS),
    category: z.enum(CATEGORIES),
    degree: text(100),
    title: text(100),
    departmentId: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null)),
    retired: z.boolean().default(false),
    primaryEmployer: text(150),
    contractStart: day,
    contractEnd: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || isDay(v), "invalidDate"),
  })
  .superRefine((v, ctx) => {
    if (isDay(v.birthDate)) {
      const today = new Date().toISOString().slice(0, 10);
      if (v.birthDate > today || v.birthDate < "1900-01-01")
        ctx.addIssue({ code: "custom", path: ["birthDate"], message: "birthDateRange" });
    }
    if (
      isDay(v.contractStart) &&
      v.contractEnd &&
      isDay(v.contractEnd) &&
      v.contractEnd < v.contractStart
    )
      ctx.addIssue({ code: "custom", path: ["contractEnd"], message: "endBeforeStart" });
  })
  .transform((v) => ({
    ...v,
    // AC-4: only external staff have a primary employer
    primaryEmployer: v.category === "PAK" ? v.primaryEmployer : null,
  }));
export type StaffFormInput = z.input<typeof staffSchema>;
export type StaffInput = z.output<typeof staffSchema>;

export const staffIdSchema = z.object({ staffId: z.string().min(1) });
export const updateStaffSchema = staffSchema.and(staffIdSchema);
export const statusSchema = staffIdSchema;
