// Shared, pure validation of the personal fields of a `Person` (used by STU-01; HR-01 has its own
// copy inside the staff schema). Messages are catalog keys under each module's `errors.*`.
import { z } from "zod";

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

export const GENDERS = ["FEMALE", "MALE"] as const;

export const personFields = {
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
  birthPlace: text(100),
  residence: text(100),
};

/** A birth date must be a real day between 1900 and today. */
export function birthDateInRange(
  value: string,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return value <= today && value >= "1900-01-01";
}
