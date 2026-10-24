"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { adjustSchema, approveSchema, reopenSchema } from "../domain/hours-schemas";
import * as hours from "./hours.service";

// The service re-checks the permission against the lecturer's department (AC-11).

export const approveMonthAction = action({
  permission: "hr.hours.approve",
  input: approveSchema,
  handler: (input, ctx) => hours.approveMonth(ctx, input),
});

export const reopenMonthAction = action({
  permission: "hr.hours.approve",
  input: reopenSchema,
  handler: (input, ctx) => hours.reopenMonth(ctx, input),
});

export const addAdjustmentAction = action({
  permission: "hr.hours.adjust",
  input: adjustSchema,
  handler: (input, ctx) => hours.addAdjustment(ctx, input),
});
