"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  bulkGroupsSchema,
  changeCohortPlanSchema,
  cohortSchema,
  cohortStatusSchema,
  groupSchema,
  groupStatusSchema,
  updateCohortSchema,
  updateGroupSchema,
} from "../domain/schemas";
import * as cohorts from "./cohort.service";
import * as groups from "./group.service";

export const createCohortAction = action({
  permission: "org.cohort.write",
  input: cohortSchema,
  handler: (input, ctx) => cohorts.createCohort(ctx, input),
});
export const renameCohortAction = action({
  permission: "org.cohort.write",
  input: updateCohortSchema,
  handler: ({ cohortId, name }, ctx) => cohorts.renameCohort(ctx, cohortId, name),
});
export const changeCohortPlanAction = action({
  permission: "org.cohort.write",
  input: changeCohortPlanSchema,
  requireReason: true,
  handler: ({ cohortId, curriculumPlanId }, ctx) =>
    cohorts.changeCohortPlan(ctx, cohortId, curriculumPlanId),
});
export const deactivateCohortAction = action({
  permission: "org.cohort.write",
  input: cohortStatusSchema,
  requireReason: true,
  handler: ({ cohortId }, ctx) => cohorts.setCohortActive(ctx, cohortId, false),
});
export const reactivateCohortAction = action({
  permission: "org.cohort.write",
  input: cohortStatusSchema,
  requireReason: true,
  handler: ({ cohortId }, ctx) => cohorts.setCohortActive(ctx, cohortId, true),
});

export const createGroupAction = action({
  permission: "org.group.write",
  input: groupSchema,
  handler: (input, ctx) => groups.createGroup(ctx, input),
});
export const updateGroupAction = action({
  permission: "org.group.write",
  input: updateGroupSchema,
  handler: ({ groupId, ...input }, ctx) => groups.updateGroup(ctx, groupId, input),
});
export const deactivateGroupAction = action({
  permission: "org.group.write",
  input: groupStatusSchema,
  requireReason: true,
  handler: ({ groupId }, ctx) => groups.setGroupActive(ctx, groupId, false),
});
export const reactivateGroupAction = action({
  permission: "org.group.write",
  input: groupStatusSchema,
  requireReason: true,
  handler: ({ groupId }, ctx) => groups.setGroupActive(ctx, groupId, true),
});
export const startOfYearAction = action({
  permission: "org.group.write",
  input: bulkGroupsSchema,
  handler: ({ academicYearId }, ctx) => groups.startOfYear(ctx, academicYearId),
});
