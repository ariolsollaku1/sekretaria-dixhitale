"use server";

import "../permissions";
import { z } from "zod";
import { action, DomainError } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  addInstallmentSchema,
  adjustInstallmentSchema,
  cancelInstallmentSchema,
  feeItemSchema,
  generatePlansSchema,
  recordPaymentSchema,
  voidPaymentSchema,
  setItemActiveSchema,
} from "../domain/schemas";
import * as fees from "./fee.service";
import * as imports from "./payment-import.service";
import * as payments from "./payment.service";
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

// ---- FIN-02: payments -------------------------------------------------------------------------

export const recordPaymentAction = action({
  permission: "fin.payment.write",
  input: recordPaymentSchema,
  handler: (input, ctx) => payments.recordPayment(ctx, input),
});
export const voidPaymentAction = action({
  permission: "fin.payment.write",
  input: voidPaymentSchema,
  requireReason: true,
  handler: ({ paymentId }, ctx) => payments.voidPayment(ctx, paymentId, ctx.reason ?? ""),
});

async function fileFrom(form: FormData): Promise<imports.ImportFile | null> {
  const file = form.get("file");
  if (!(file instanceof File)) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}
const yearFrom = (form: FormData) => String(form.get("academicYearId") ?? "");

/** AC-7: preview only (nothing is saved), still gated by the payment write permission. */
export async function previewPaymentImportAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" as const };
  if (!(await can(user, "fin.payment.write")))
    return { ok: false as const, error: "FORBIDDEN" as const };
  const file = await fileFrom(form);
  const year = yearFrom(form);
  if (!file || !year) return { ok: false as const, error: "empty" as const };
  return imports.previewPaymentImport(file, year);
}

export const commitPaymentImportAction = action({
  permission: "fin.payment.write",
  input: z.instanceof(FormData),
  handler: async (form, ctx) => {
    const file = await fileFrom(form);
    const year = yearFrom(form);
    if (!file || !year) throw new DomainError("VALIDATION", "empty", { file: ["empty"] });
    return imports.commitPaymentImport(ctx, file, year);
  },
});
