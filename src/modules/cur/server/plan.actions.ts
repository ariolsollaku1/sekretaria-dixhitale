"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  addPlanCourseSchema,
  createPlanSchema,
  planIdSchema,
  removePlanCourseSchema,
  updatePlanCourseSchema,
  updatePlanSchema,
} from "../domain/plan-schemas";
import * as plans from "./plan.service";

// The permission is role-based here; the service checks it against the plan's program (scope).
const permission = "cur.plan.write";

export const createPlanAction = action({
  permission,
  input: createPlanSchema,
  handler: (input, ctx) => plans.createPlan(ctx, input),
});
export const updatePlanAction = action({
  permission,
  input: updatePlanSchema,
  handler: ({ planId, ...input }, ctx) => plans.updatePlan(ctx, planId, input),
});
export const addPlanCourseAction = action({
  permission,
  input: addPlanCourseSchema,
  handler: (input, ctx) => plans.addPlanCourse(ctx, input),
});
export const updatePlanCourseAction = action({
  permission,
  input: updatePlanCourseSchema,
  handler: (input, ctx) => plans.updatePlanCourse(ctx, input),
});
export const removePlanCourseAction = action({
  permission,
  input: removePlanCourseSchema,
  handler: ({ planCourseId }, ctx) => plans.removePlanCourse(ctx, planCourseId),
});
export const approvePlanAction = action({
  permission,
  input: planIdSchema,
  handler: ({ planId }, ctx) => plans.approvePlan(ctx, planId),
});
export const archivePlanAction = action({
  permission,
  input: planIdSchema,
  requireReason: true,
  handler: ({ planId }, ctx) => plans.archivePlan(ctx, planId),
});
export const deletePlanAction = action({
  permission,
  input: planIdSchema,
  handler: ({ planId }, ctx) => plans.deleteDraftPlan(ctx, planId),
});
