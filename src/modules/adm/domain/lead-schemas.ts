import { z } from "zod";
import { LEAD_SOURCES, isEmail } from "./lead-rules";

// Messages are catalog keys under `adm.errors.*`.
const id = z.string().min(1, "required");
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((v) => v || null);

const email = z
  .string()
  .trim()
  .max(254, "tooLong")
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || isEmail(v), "invalidEmail");

/** AC-3: contact data and where the lead came from (manual entry and editing). */
const leadFields = {
  firstName: z.string().trim().min(1, "required").max(100, "tooLong"),
  lastName: z.string().trim().min(1, "required").max(100, "tooLong"),
  email,
  phone: optional(40),
  programId: z
    .string()
    .nullish()
    .transform((v) => v || null),
  programNote: optional(200),
  message: optional(2000),
  source: z.enum(LEAD_SOURCES, { error: "required" }),
  sourceNote: optional(200),
};

const hasContact = (v: { email: string | null; phone: string | null }) =>
  v.email !== null || v.phone !== null;

export const createLeadSchema = z
  .object({ ...leadFields, consent: z.boolean().default(false) })
  .refine(hasContact, { path: ["email"], message: "contactRequired" });
export const updateLeadSchema = z
  .object({ leadId: id, ...leadFields })
  .refine(hasContact, { path: ["email"], message: "contactRequired" });

export const changeLeadStatusSchema = z.object({
  leadId: id,
  to: z.enum(["NEW", "CONTACTED", "APPLIED", "LOST"], { error: "required" }),
  reason: optional(500),
});
export const assignLeadSchema = z.object({
  leadId: id,
  assigneeId: z
    .string()
    .nullish()
    .transform((v) => v || null),
});
export const addLeadNoteSchema = z.object({
  leadId: id,
  body: z.string().trim().min(1, "required").max(2000, "tooLong"),
});
export const inviteLeadSchema = z.object({ leadId: id });
export const importLeadsSchema = z.object({
  csv: z.string().min(1, "required"),
  source: z.enum(LEAD_SOURCES, { error: "required" }),
  sourceNote: optional(200),
});

export type CreateLeadInput = z.output<typeof createLeadSchema>;
export type UpdateLeadInput = z.output<typeof updateLeadSchema>;
