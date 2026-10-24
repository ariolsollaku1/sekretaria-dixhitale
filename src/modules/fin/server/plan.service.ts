import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import {
  planLines,
  validateAdjustment,
  type FeeKind,
  type ScheduleItemInput,
} from "../domain/fee-rules";
import { MAX_CENTS, centsOf, formatCents } from "../domain/money";
import type { GeneratePlansInput } from "../domain/schemas";
import { assertYearOpen } from "./fee.service";

type Ctx = ActionContext;
const date = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

function refuse(errors: Record<string, string | undefined>): never {
  throw new DomainError(
    "VALIDATION",
    "Check the plan",
    Object.fromEntries(
      Object.entries(errors)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, [v!]]),
    ),
  );
}

/**
 * AC-6/AC-7 (Q-88): create the plans of a program and year for the open enrollments that are
 * registered in the year and have none yet.
 */
export async function generatePlans(ctx: Ctx, input: GeneratePlansInput) {
  const year = await assertYearOpen(ctx, input.academicYearId);
  const program = await ctx.db.studyProgram.findUnique({
    where: { id: input.programId },
    select: { id: true },
  });
  if (!program) throw new DomainError("NOT_FOUND", "Program not found");

  const items = await ctx.db.feeScheduleItem.findMany({
    where: { programId: program.id, academicYearId: year.id, active: true },
    include: { installments: true, discounts: true },
  });
  if (items.length === 0) refuse({ programId: "noFees" });
  const lines = planLines(
    items.map((i): ScheduleItemInput => ({
      id: i.id,
      kind: i.kind,
      label: i.label,
      amountCents: centsOf(i.amount),
      installments: i.installments.map((t) => ({
        dueDate: day(t.dueDate),
        amountCents: centsOf(t.amount),
      })),
      discounts: i.discounts.map((d) => ({
        label: d.label,
        kind: d.kind,
        value: centsOf(d.value),
        validFrom: day(d.validFrom),
        validTo: day(d.validTo),
      })),
    })),
    year.startDate,
  );

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      programId: program.id,
      status: { in: ["ACTIVE", "SUSPENDED"] },
      years: { some: { academicYearId: year.id } },
      ...(input.studentNumber ? { student: { studentNumber: input.studentNumber } } : {}),
    },
    select: {
      id: true,
      paymentPlans: { where: { academicYearId: year.id }, select: { id: true } },
    },
    orderBy: { id: "asc" },
  });
  if (input.studentNumber && enrollments.length === 0) refuse({ studentNumber: "notFound" });

  let created = 0;
  let skipped = 0;
  for (const e of enrollments) {
    if (e.paymentPlans.length > 0) {
      skipped++;
      continue;
    }
    const plan = await ctx.db.paymentPlan.create({
      data: {
        enrollmentId: e.id,
        academicYearId: year.id,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
        installments: {
          create: lines.map((l) => ({
            sequence: l.sequence,
            kind: l.kind,
            label: l.label,
            dueDate: date(l.dueDate),
            amount: formatCents(l.amountCents),
            earlyAmount: l.earlyCents === null ? null : formatCents(l.earlyCents),
            earlyUntil: l.earlyUntil ? date(l.earlyUntil) : null,
            scheduleItemId: l.scheduleItemId,
            createdById: ctx.user.id,
            updatedById: ctx.user.id,
          })),
        },
      },
    });
    created++;
    await ctx.audit({
      action: "fin.plan.create",
      entityType: "PaymentPlan",
      entityId: plan.id,
      before: null,
      after: {
        enrollmentId: e.id,
        academicYearId: year.id,
        installments: lines.length,
        total: formatCents(lines.reduce((a, l) => a + l.amountCents, 0)),
      },
    });
  }
  return { created, skipped };
}

async function loadInstallment(ctx: Ctx, installmentId: string) {
  const row = await ctx.db.planInstallment.findUnique({
    where: { id: installmentId },
    include: { plan: { select: { academicYearId: true } } },
  });
  if (!row) throw new DomainError("NOT_FOUND", "Installment not found");
  await assertYearOpen(ctx, row.plan.academicYearId);
  if (row.status === "CANCELLED") throw new DomainError("CONFLICT", "CANCELLED");
  return row;
}

const view = (i: {
  kind: string;
  label: string;
  dueDate: Date;
  amount: { toFixed(n: number): string };
  earlyAmount: { toFixed(n: number): string } | null;
  earlyUntil: Date | null;
  status: string;
}) => ({
  kind: i.kind,
  label: i.label,
  dueDate: day(i.dueDate),
  amount: i.amount.toFixed(2),
  earlyAmount: i.earlyAmount ? i.earlyAmount.toFixed(2) : null,
  earlyUntil: i.earlyUntil ? day(i.earlyUntil) : null,
  status: i.status,
});

/** AC-8 (Q-89): another amount and/or due date, with a reason; a new amount clears the early amount. */
export async function adjustInstallment(
  ctx: Ctx,
  input: { installmentId: string; amount: number; dueDate: string },
  reason: string,
) {
  const before = await loadInstallment(ctx, input.installmentId);
  const errors = validateAdjustment({ dueDate: input.dueDate, amountCents: input.amount });
  if (input.amount > MAX_CENTS) errors.amount = "range";
  if (Object.keys(errors).length > 0) refuse(errors);
  const amountChanged = centsOf(before.amount) !== input.amount;
  const after = await ctx.db.planInstallment.update({
    where: { id: before.id },
    data: {
      amount: formatCents(input.amount),
      dueDate: date(input.dueDate),
      ...(amountChanged ? { earlyAmount: null, earlyUntil: null } : {}),
      adjustedAt: new Date(),
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "fin.plan.adjust",
    entityType: "PlanInstallment",
    entityId: before.id,
    before: view(before),
    after: view(after),
    reason,
  });
  return { installmentId: before.id };
}

/** AC-8: an extra installment, added by hand. */
export async function addInstallment(
  ctx: Ctx,
  input: { planId: string; kind: FeeKind; label: string; amount: number; dueDate: string },
  reason: string,
) {
  const plan = await ctx.db.paymentPlan.findUnique({ where: { id: input.planId } });
  if (!plan) throw new DomainError("NOT_FOUND", "Plan not found");
  await assertYearOpen(ctx, plan.academicYearId);
  const errors = validateAdjustment({ dueDate: input.dueDate, amountCents: input.amount });
  if (input.amount > MAX_CENTS) errors.amount = "range";
  if (Object.keys(errors).length > 0) refuse(errors);
  const last = await ctx.db.planInstallment.aggregate({
    where: { planId: plan.id },
    _max: { sequence: true },
  });
  const created = await ctx.db.planInstallment.create({
    data: {
      planId: plan.id,
      sequence: (last._max.sequence ?? 0) + 1,
      kind: input.kind,
      label: input.label,
      dueDate: date(input.dueDate),
      amount: formatCents(input.amount),
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "fin.plan.add_installment",
    entityType: "PlanInstallment",
    entityId: created.id,
    before: null,
    after: { planId: plan.id, ...view(created) },
    reason,
  });
  return { installmentId: created.id };
}

/** AC-8: cancel an installment; it stays visible with its reason. */
export async function cancelInstallment(ctx: Ctx, installmentId: string, reason: string) {
  const before = await loadInstallment(ctx, installmentId);
  const after = await ctx.db.planInstallment.update({
    where: { id: before.id },
    data: {
      status: "CANCELLED",
      cancelReason: reason,
      adjustedAt: new Date(),
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "fin.plan.cancel_installment",
    entityType: "PlanInstallment",
    entityId: before.id,
    before: view(before),
    after: view(after),
    reason,
  });
  return { installmentId: before.id };
}
