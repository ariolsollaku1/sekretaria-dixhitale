import { z } from "zod";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth");
const reason = z.string().trim().min(3, "reasonRequired").max(300, "tooLong");
const id = z.string().min(1, "required");

export const approveSchema = z.object({ staffId: id, month });
export type ApproveInput = z.infer<typeof approveSchema>;

export const reopenSchema = z.object({ staffId: id, month, reason });
export type ReopenInput = z.infer<typeof reopenSchema>;

/** AC-9 (Q-132): whole hours, never zero, between -100 and 100. */
export const adjustSchema = z.object({
  staffId: id,
  assignmentId: id,
  month,
  hours: z
    .number({ error: "hoursRange" })
    .int("hoursRange")
    .min(-100, "hoursRange")
    .max(100, "hoursRange")
    .refine((v) => v !== 0, "hoursRange"),
  reason,
});
export type AdjustInput = z.infer<typeof adjustSchema>;
