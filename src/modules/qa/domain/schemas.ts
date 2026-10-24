import { z } from "zod";
import { questionSchema } from "./question-rules";

const id = z.string().min(1, "required");

export const createCampaignSchema = z.object({
  academicYearId: id,
  name: z.string().trim().min(1, "required").max(120, "tooLong"),
  copyFromId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const setQuestionsSchema = z.object({
  campaignId: id,
  // validated in full (unique keys, counts) by the service with `questionsSchema`
  questions: z.array(questionSchema).max(100, "tooManyQuestions"),
});
export type SetQuestionsInput = z.infer<typeof setQuestionsSchema>;

export const campaignIdSchema = z.object({ campaignId: id });

export const submitSchema = z.object({
  campaignId: id,
  /** an assignment id, or "ADMIN" */
  target: id,
  answers: z.record(z.string(), z.union([z.number(), z.string()])),
});
export type SubmitInput = z.infer<typeof submitSchema>;
