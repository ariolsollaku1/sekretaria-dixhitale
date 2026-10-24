import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { isDay } from "../domain/fee-rules";
import { MAX_CENTS, formatCents } from "../domain/money";
import { dayInTirane } from "../domain/payment-rules";
import type { RecordPaymentInput } from "../domain/schemas";

type Ctx = ActionContext;
const date = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

function refuse(errors: Record<string, string>): never {
  throw new DomainError(
    "VALIDATION",
    "Check the payment",
    Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
  );
}

const view = (p: {
  planId: string;
  amount: { toFixed(n: number): string };
  paidOn: Date;
  reference: string;
  method: string;
  installmentId: string | null;
  status: string;
}) => ({
  planId: p.planId,
  amount: p.amount.toFixed(2),
  paidOn: day(p.paidOn),
  reference: p.reference,
  method: p.method,
  installmentId: p.installmentId,
  status: p.status,
});

/**
 * AC-1 (Q-109): record a payment on a plan. Allowed on closed years too (AC-13, Q-113).
 * `importBatch` marks rows that come from a file import.
 */
export async function recordPayment(ctx: Ctx, input: RecordPaymentInput, importBatch?: string) {
  const plan = await ctx.db.paymentPlan.findUnique({
    where: { id: input.planId },
    select: { id: true },
  });
  if (!plan) throw new DomainError("NOT_FOUND", "Plan not found");
  const errors: Record<string, string> = {};
  if (input.amount <= 0 || input.amount > MAX_CENTS) errors.amount = "range";
  if (!isDay(input.paidOn)) errors.paidOn = "invalidDate";
  else if (input.paidOn > dayInTirane()) errors.paidOn = "future";
  if (input.installmentId) {
    const target = await ctx.db.planInstallment.findUnique({
      where: { id: input.installmentId },
      select: { planId: true, status: true },
    });
    if (!target || target.planId !== plan.id) errors.installmentId = "notInPlan";
    else if (target.status === "CANCELLED") errors.installmentId = "CANCELLED";
  }
  if (Object.keys(errors).length > 0) refuse(errors);

  const created = await ctx.db.payment.create({
    data: {
      planId: plan.id,
      amount: formatCents(input.amount),
      paidOn: date(input.paidOn),
      reference: input.reference,
      method: input.method,
      installmentId: input.installmentId,
      importBatch: importBatch ?? null,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "fin.payment.record",
    entityType: "Payment",
    entityId: created.id,
    before: null,
    after: { ...view(created), importBatch: importBatch ?? null },
  });
  return { paymentId: created.id };
}

/** AC-2: void a payment with a reason; it stays visible and no longer counts. */
export async function voidPayment(ctx: Ctx, paymentId: string, reason: string) {
  const before = await ctx.db.payment.findUnique({ where: { id: paymentId } });
  if (!before) throw new DomainError("NOT_FOUND", "Payment not found");
  if (before.status === "VOIDED") throw new DomainError("CONFLICT", "VOIDED");
  const after = await ctx.db.payment.update({
    where: { id: before.id },
    data: {
      status: "VOIDED",
      voidReason: reason,
      voidedAt: new Date(),
      voidedById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "fin.payment.void",
    entityType: "Payment",
    entityId: before.id,
    before: view(before),
    after: view(after),
    reason,
  });
  return { paymentId: before.id };
}
