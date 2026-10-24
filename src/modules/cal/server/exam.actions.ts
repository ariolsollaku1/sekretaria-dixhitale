"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  publishSessionSchema,
  removeSittingSchema,
  sessionSchema,
  sittingSchema,
  updateSessionSchema,
  updateSittingSchema,
} from "../domain/exam-schemas";
import * as exams from "./exam.service";

export const createSessionAction = action({
  permission: "cal.exam.write",
  input: sessionSchema,
  handler: (input, ctx) => exams.createSession(ctx, input),
});
export const updateSessionAction = action({
  permission: "cal.exam.write",
  input: updateSessionSchema,
  handler: ({ sessionId, ...input }, ctx) => exams.updateSession(ctx, sessionId, input),
});
export const publishSessionAction = action({
  permission: "cal.exam.write",
  input: publishSessionSchema,
  handler: ({ sessionId, published }, ctx) => exams.setPublished(ctx, sessionId, published),
});
export const createSittingAction = action({
  permission: "cal.exam.write",
  input: sittingSchema,
  handler: (input, ctx) => exams.createSitting(ctx, input),
});
export const updateSittingAction = action({
  permission: "cal.exam.write",
  input: updateSittingSchema,
  handler: ({ sittingId, ...input }, ctx) => exams.updateSitting(ctx, sittingId, input),
});
export const removeSittingAction = action({
  permission: "cal.exam.write",
  input: removeSittingSchema,
  handler: ({ sittingId }, ctx) => exams.removeSitting(ctx, sittingId),
});
