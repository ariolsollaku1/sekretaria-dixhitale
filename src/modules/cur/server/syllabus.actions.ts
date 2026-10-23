"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  carryForwardSchema,
  syllabusIdSchema,
  updateSyllabusSchema,
  uploadSyllabusSchema,
} from "../domain/syllabus-schemas";
import * as syllabi from "./syllabus.service";

// Role-based here; the service checks the permission against the plan's program (scope).
const permission = "cur.syllabus.write";

export const uploadSyllabusAction = action({
  permission,
  input: uploadSyllabusSchema,
  handler: (input, ctx) => syllabi.uploadSyllabus(ctx, input),
});
export const updateSyllabusAction = action({
  permission,
  input: updateSyllabusSchema,
  handler: ({ syllabusId, ...input }, ctx) => syllabi.updateDraft(ctx, syllabusId, input),
});
export const deleteSyllabusAction = action({
  permission,
  input: syllabusIdSchema,
  handler: ({ syllabusId }, ctx) => syllabi.deleteDraft(ctx, syllabusId),
});
export const approveSyllabusAction = action({
  permission,
  input: syllabusIdSchema,
  handler: ({ syllabusId }, ctx) => syllabi.approve(ctx, syllabusId),
});
export const carryForwardAction = action({
  permission,
  input: carryForwardSchema,
  handler: (input, ctx) => syllabi.carryForward(ctx, input),
});
