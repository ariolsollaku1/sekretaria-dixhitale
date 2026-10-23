import { z } from "zod";
import { unknownPlaceholders } from "./placeholders";

export const MAX_RECIPIENTS = 2000; // Q-51
export const BATCH_SIZE = 200;
export const SUBJECT_MAX = 200;
export const BODY_MAX = 5000;

/** Messages are catalog keys (`msg.errors.*`). */
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "required")
    .max(max, "tooLong")
    .refine((v) => unknownPlaceholders(v).length === 0, "unknownPlaceholder");

export const messageContentSchema = z.object({
  subject: text(SUBJECT_MAX),
  body: text(BODY_MAX),
});
export type MessageContentInput = z.input<typeof messageContentSchema>;

/** AC-5: the source list (table id + its validated filters) and the wording. */
export const sendMessageSchema = messageContentSchema.extend({
  tableId: z.string().min(1).max(100),
  filters: z.record(z.string().max(100), z.string().max(200)).default({}),
});

export const templateSchema = messageContentSchema.extend({
  name: z.string().trim().min(1, "required").max(100, "tooLong"),
});
export type TemplateInput = z.input<typeof templateSchema>;

export const archiveTemplateSchema = z.object({ templateId: z.string().min(1) });
