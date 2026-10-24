"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { recordRecognitionSchema, voidRecognitionSchema } from "../domain/request-schemas";
import * as recognition from "./recognition.service";

export const recordRecognitionAction = action({
  permission: "stu.recognition.write",
  input: recordRecognitionSchema,
  handler: (input, ctx) => recognition.recordRecognition(ctx, input),
});

export const voidRecognitionAction = action({
  permission: "stu.recognition.write",
  input: voidRecognitionSchema,
  requireReason: true,
  handler: (input, ctx) => recognition.voidRecognition(ctx, input),
});
