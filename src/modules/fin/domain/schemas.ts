import { z } from "zod";
import { DISCOUNT_KINDS, FEE_KINDS } from "./fee-rules";
import { parseCents } from "./money";
import { PAYMENT_METHODS } from "./payment-rules";

const id = z.string().min(1, "required");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");
/** A decimal string with at most two decimals, parsed to whole cents (AC-12). */
const money = z
  .string({ error: "required" })
  .trim()
  .transform((v, ctx) => {
    const cents = parseCents(v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "amount" });
      return z.NEVER;
    }
    return cents;
  });
const label = z.string().trim().max(60, "tooLong").default("");

export const feeItemSchema = z.object({
  itemId: z.string().min(1).nullish(),
  programId: id,
  academicYearId: id,
  kind: z.enum(FEE_KINDS, { error: "required" }),
  label,
  amount: money,
  installments: z
    .array(z.object({ dueDate: day, amount: money }))
    .max(24, "tooMany")
    .default([]),
  discounts: z
    .array(
      z.object({
        label,
        kind: z.enum(DISCOUNT_KINDS),
        /** Percent (e.g. "10.5") or amount, by kind; both parsed to hundredths/cents. */
        value: money,
        validFrom: day,
        validTo: day,
      }),
    )
    .max(10, "tooMany")
    .default([]),
});
export type FeeItemInput = z.output<typeof feeItemSchema>;

export const setItemActiveSchema = z.object({ itemId: id, active: z.boolean() });

export const generatePlansSchema = z.object({
  academicYearId: id,
  programId: id,
  studentNumber: z
    .string()
    .trim()
    .max(20, "tooLong")
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type GeneratePlansInput = z.output<typeof generatePlansSchema>;

export const adjustInstallmentSchema = z.object({
  installmentId: id,
  amount: money,
  dueDate: day,
});
export const addInstallmentSchema = z.object({
  planId: id,
  kind: z.enum(FEE_KINDS, { error: "required" }),
  label,
  amount: money,
  dueDate: day,
});
export const cancelInstallmentSchema = z.object({ installmentId: id });

// ---- FIN-02 -----------------------------------------------------------------------------------

export const recordPaymentSchema = z.object({
  planId: id,
  amount: money,
  paidOn: day,
  reference: z.string().trim().max(120, "tooLong").default(""),
  method: z.enum(PAYMENT_METHODS, { error: "required" }),
  installmentId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type RecordPaymentInput = z.output<typeof recordPaymentSchema>;

export const voidPaymentSchema = z.object({ paymentId: id });
