"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  campaignIdSchema,
  createCampaignSchema,
  setQuestionsSchema,
  submitSchema,
} from "../domain/schemas";
import * as campaigns from "./campaign.service";
import * as surveys from "./survey.service";

export const createCampaignAction = action({
  permission: "qa.campaign.manage",
  input: createCampaignSchema,
  handler: (input, ctx) => campaigns.createCampaign(ctx, input),
});
export const setQuestionsAction = action({
  permission: "qa.campaign.manage",
  input: setQuestionsSchema,
  handler: (input, ctx) => campaigns.setQuestions(ctx, input),
});
export const openCampaignAction = action({
  permission: "qa.campaign.manage",
  input: campaignIdSchema,
  handler: ({ campaignId }, ctx) => campaigns.openCampaign(ctx, campaignId),
});
export const closeCampaignAction = action({
  permission: "qa.campaign.manage",
  input: campaignIdSchema,
  handler: ({ campaignId }, ctx) => campaigns.closeCampaign(ctx, campaignId),
});

export const submitSurveyAction = action({
  permission: "qa.survey.submit",
  input: submitSchema,
  handler: (input, ctx) => surveys.submitSurvey(ctx, input),
});
