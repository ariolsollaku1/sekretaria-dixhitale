import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((v) => v || null);

/** AC-5 */
export const recordRecognitionSchema = z.object({
  submissionId: z.string().min(1),
  courseCode: z.string().trim().min(1, "required").max(40, "tooLong"),
  credits: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 60), "creditsRange"),
  note: optionalText(500),
});
export type RecordRecognitionInput = z.output<typeof recordRecognitionSchema>;

/** AC-6 */
export const voidRecognitionSchema = z.object({ id: z.string().min(1) });
