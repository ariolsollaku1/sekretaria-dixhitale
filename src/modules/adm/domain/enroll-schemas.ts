import { z } from "zod";
import { BULK_MAX, REGISTRATION_TYPES } from "./enroll-rules";

const day = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
    "invalidDate",
  );

const placement = {
  registrationType: z.enum(REGISTRATION_TYPES),
  cohortId: z.string().min(1, "required"),
  groupId: z.string().min(1, "required"),
  startedAt: day,
  allowMissingDocuments: z.boolean().default(false),
};

/**
 * AC-2: the confirmed personal data are validated by STU-01 (`personalSchema`) in the service, so
 * every field error comes from one place; here they only travel as a record.
 */
export const enrollSchema = z.object({
  applicationId: z.string().min(1),
  person: z.record(z.string(), z.unknown()),
  ...placement,
});
export type EnrollInput = z.infer<typeof enrollSchema>;

/** AC-7 */
export const enrollManySchema = z.object({
  applicationIds: z
    .array(z.string().min(1))
    .min(1, "required")
    .max(BULK_MAX, "tooMany")
    .refine((ids) => new Set(ids).size === ids.length, "invalid"),
  ...placement,
});
export type EnrollManyInput = z.infer<typeof enrollManySchema>;
