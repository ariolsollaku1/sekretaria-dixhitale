import { z } from "zod";
import { EVALUATION_KINDS } from "./evaluation-rules";
import { isDay } from "./schemas";

const day = z.string().refine(isDay, "invalidDate");
const id = z.string().min(1).max(64);

/** AC-2. Messages are catalog keys (`hrEvaluation.errors.*`). */
export const openCampaignSchema = z
  .object({
    name: z.string().trim().min(1, "required").max(200, "tooLong"),
    kind: z.enum(EVALUATION_KINDS),
    periodStart: day,
    periodEnd: day,
    resultsVisible: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.periodStart && v.periodEnd && v.periodEnd < v.periodStart)
      ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "periodOrder" });
  });
export type OpenCampaignInput = z.output<typeof openCampaignSchema>;

export const closeCampaignSchema = z.object({ campaignId: id });
export const assignEvaluatorSchema = z.object({ evaluationId: id, evaluatorId: id });
export const submitEvaluationSchema = z.object({
  evaluationId: id,
  answers: z.record(z.string().max(100), z.union([z.string().max(6000), z.number(), z.boolean()])),
});
