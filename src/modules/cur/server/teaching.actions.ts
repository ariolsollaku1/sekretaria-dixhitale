"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  assignmentSchema,
  copyAssignmentsSchema,
  removeAssignmentSchema,
  updateAssignmentSchema,
} from "../domain/teaching-schemas";
import * as teaching from "./teaching.service";

// The permission is role-based here; the service checks it against the group's program (scope).
const permission = "cur.teaching.write";

export const createAssignmentAction = action({
  permission,
  input: assignmentSchema,
  handler: (input, ctx) => teaching.createAssignment(ctx, input),
});
export const updateAssignmentAction = action({
  permission,
  input: updateAssignmentSchema,
  handler: ({ assignmentId, ...input }, ctx) => teaching.updateAssignment(ctx, assignmentId, input),
});
export const removeAssignmentAction = action({
  permission,
  input: removeAssignmentSchema,
  handler: ({ assignmentId }, ctx) => teaching.removeAssignment(ctx, assignmentId),
});
export const copyAssignmentsAction = action({
  permission,
  input: copyAssignmentsSchema,
  handler: ({ fromYearId, toYearId }, ctx) => teaching.copyAssignments(ctx, fromYearId, toYearId),
});
