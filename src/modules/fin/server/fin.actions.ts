"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  addInstallmentSchema,
  adjustInstallmentSchema,
  cancelInstallmentSchema,
  feeItemSchema,
  generatePlansSchema,
  setItemActiveSchema,
} from "../domain/schemas";
import * as fees from "./fee.service";
import * as plans from "./plan.service";

// Fees and plans are institution-wide (Finance); a role without the permission is refused by the
// wrapper before anything runs. Changes to plans demand a reason (Q-89).

export const saveFeeItemAction = action({
  permission: "fin.fee.write",
  input: feeItemSchema,
  handler: (input, ctx) => fees.saveFeeItem(ctx, input),
});
export const setItemActiveAction = action({
  permission: "fin.fee.write",
  input: setItemActiveSchema,
  handler: ({ itemId, active }, ctx) => fees.setItemActive(ctx, itemId, active),
});

export const generatePlansAction = action({
  permission: "fin.plan.write",
  input: generatePlansSchema,
  handler: (input, ctx) => plans.generatePlans(ctx, input),
});
export const adjustInstallmentAction = action({
  permission: "fin.plan.write",
  input: adjustInstallmentSchema,
  requireReason: true,
  handler: (input, ctx) => plans.adjustInstallment(ctx, input, ctx.reason ?? ""),
});
export const addInstallmentAction = action({
  permission: "fin.plan.write",
  input: addInstallmentSchema,
  requireReason: true,
  handler: (input, ctx) => plans.addInstallment(ctx, input, ctx.reason ?? ""),
});
export const cancelInstallmentAction = action({
  permission: "fin.plan.write",
  input: cancelInstallmentSchema,
  requireReason: true,
  handler: ({ installmentId }, ctx) =>
    plans.cancelInstallment(ctx, installmentId, ctx.reason ?? ""),
});
