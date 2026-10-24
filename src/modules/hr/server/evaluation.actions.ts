"use server";

import "../permissions";
import "../evaluation-permissions";
import { action } from "@/lib/actions";
import {
  assignEvaluatorSchema,
  closeCampaignSchema,
  openCampaignSchema,
  submitEvaluationSchema,
} from "../domain/evaluation-schemas";
import * as evaluation from "./evaluation.service";

export const openCampaignAction = action({
  permission: "hr.evaluation.manage",
  input: openCampaignSchema,
  handler: (input, ctx) => evaluation.openCampaign(ctx, input),
});

export const closeCampaignAction = action({
  permission: "hr.evaluation.manage",
  input: closeCampaignSchema,
  handler: (input, ctx) => evaluation.closeCampaign(ctx, input),
});

export const assignEvaluatorAction = action({
  permission: "hr.evaluation.manage",
  input: assignEvaluatorSchema,
  handler: (input, ctx) => evaluation.assignEvaluator(ctx, input),
});

/** The assignment is the real guard (AC-7); the permission only keeps students out. */
export const submitEvaluationAction = action({
  permission: "hr.evaluation.fill",
  input: submitEvaluationSchema,
  handler: (input, ctx) => evaluation.submitEvaluation(ctx, input),
});
