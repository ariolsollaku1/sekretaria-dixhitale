import { z } from "zod";

const minute = z
  .number({ error: "timeRange" })
  .int("timeRange")
  .min(0, "timeRange")
  .max(1440, "timeRange");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");
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

/** AC-1: validity dates are optional (default: the assignment's semester). */
export const slotSchema = z.object({
  assignmentId: z.string().min(1, "required"),
  weekday: z
    .number({ error: "weekdayRange" })
    .int("weekdayRange")
    .min(1, "weekdayRange")
    .max(7, "weekdayRange"),
  startMinute: minute,
  endMinute: minute,
  room,
  validFrom: day.nullish().transform((v) => v ?? null),
  validTo: day.nullish().transform((v) => v ?? null),
  note,
});
export type SlotInput = z.infer<typeof slotSchema>;

export const updateSlotSchema = slotSchema
  .omit({ assignmentId: true })
  .extend({ entryId: z.string().min(1) });
export const removeSlotSchema = z.object({ entryId: z.string().min(1) });
