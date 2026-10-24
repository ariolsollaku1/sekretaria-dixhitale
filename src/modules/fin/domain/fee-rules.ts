import { percentOf, shares } from "./money";

export const FEE_KINDS = ["TUITION", "ADMINISTRATIVE", "DIPLOMA", "BACKLOG_EXAM", "OTHER"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];
export const DISCOUNT_KINDS = ["PERCENT", "AMOUNT"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** A calendar day "YYYY-MM-DD" that exists. */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export type InstallmentDraft = { dueDate: string; amountCents: number };

/**
 * AC-2 (Q-86): the installments of a fee add up to the fee exactly, with valid, distinct due dates.
 * An empty list is allowed (one installment on the first day of the year is used instead).
 */
export function validateInstallments(
  feeCents: number,
  rows: InstallmentDraft[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (rows.length === 0) return errors;
  if (rows.some((r) => !isDay(r.dueDate))) errors.installments = "invalidDate";
  else if (new Set(rows.map((r) => r.dueDate)).size !== rows.length)
    errors.installments = "duplicateDate";
  else if (rows.some((r) => !Number.isInteger(r.amountCents) || r.amountCents <= 0))
    errors.installments = "amountRange";
  else if (rows.reduce((a, r) => a + r.amountCents, 0) !== feeCents)
    errors.installments = "sumMismatch";
  return errors;
}

export type DiscountDraft = {
  label: string;
  kind: DiscountKind;
  /** Cents for `AMOUNT`, hundredths of a percent for `PERCENT` (10.5% = 1050). */
  value: number;
  validFrom: string;
  validTo: string;
};

/** AC-3 (Q-87) */
export function validateDiscount(feeCents: number, d: DiscountDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isDay(d.validFrom) || !isDay(d.validTo)) errors.window = "invalidDate";
  else if (d.validFrom > d.validTo) errors.window = "reversed";
  if (!Number.isInteger(d.value) || d.value <= 0) errors.value = "range";
  else if (d.kind === "PERCENT" && d.value > 10000) errors.value = "range";
  else if (d.kind === "AMOUNT" && d.value >= feeCents) errors.value = "range";
  return errors;
}

export type PlanLine = {
  sequence: number;
  kind: FeeKind;
  label: string;
  dueDate: string;
  amountCents: number;
  earlyCents: number | null;
  earlyUntil: string | null;
  scheduleItemId: string;
};

export type ScheduleItemInput = {
  id: string;
  kind: FeeKind;
  label: string;
  amountCents: number;
  installments: InstallmentDraft[];
  discounts: DiscountDraft[];
};

/**
 * AC-7 (Q-87): per installment, the amount to pay under the item's best discount and the end of
 * its window. Percent discounts reduce each installment; amount discounts are shared across the
 * installments in proportion to their amounts (the parts add up exactly). Discounts do not
 * combine: the one with the largest total reduction wins, the earlier window on a tie.
 */
export function earlyAmounts(
  installments: number[],
  discounts: DiscountDraft[],
): { earlyCents: number | null; earlyUntil: string | null }[] {
  const none = installments.map(() => ({ earlyCents: null, earlyUntil: null }));
  let best: { reduction: number; parts: number[]; until: string } | null = null;
  for (const d of discounts) {
    const cuts =
      d.kind === "PERCENT"
        ? installments.map((a) => percentOf(a, d.value))
        : shares(d.value, installments);
    const parts = installments.map((a, i) => Math.min(a, cuts[i] ?? 0));
    const reduction = parts.reduce((a, b) => a + b, 0);
    if (
      reduction > 0 &&
      (!best ||
        reduction > best.reduction ||
        (reduction === best.reduction && d.validTo < best.until))
    )
      best = { reduction, parts, until: d.validTo };
  }
  if (!best) return none;
  const chosen = best;
  return installments.map((a, i) => {
    const cut = chosen.parts[i] ?? 0;
    return cut > 0
      ? { earlyCents: a - cut, earlyUntil: chosen.until }
      : { earlyCents: null, earlyUntil: null };
  });
}

const KIND_ORDER = new Map(FEE_KINDS.map((k, i) => [k, i]));

/**
 * AC-6/AC-7 (Q-86): the plan's installments from the active items of a program and year, ordered by
 * due date. An item without installments becomes one installment due on `yearStart`.
 */
export function planLines(items: ScheduleItemInput[], yearStart: string): PlanLine[] {
  const lines: Omit<PlanLine, "sequence">[] = [];
  for (const item of items) {
    const parts: InstallmentDraft[] =
      item.installments.length > 0
        ? item.installments
        : [{ dueDate: yearStart, amountCents: item.amountCents }];
    const early = earlyAmounts(
      parts.map((p) => p.amountCents),
      item.discounts,
    );
    parts.forEach((p, i) =>
      lines.push({
        kind: item.kind,
        label: item.label,
        dueDate: p.dueDate,
        amountCents: p.amountCents,
        earlyCents: early[i]?.earlyCents ?? null,
        earlyUntil: early[i]?.earlyUntil ?? null,
        scheduleItemId: item.id,
      }),
    );
  }
  lines.sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0) ||
      a.label.localeCompare(b.label),
  );
  return lines.map((l, i) => ({ ...l, sequence: i + 1 }));
}

export type TotalsInput = {
  status: "ACTIVE" | "CANCELLED";
  amountCents: number;
  earlyCents: number | null;
};

/** AC-9: the plan total and the total if every early window is honoured; cancelled ones do not count. */
export function planTotals(rows: TotalsInput[]) {
  const active = rows.filter((r) => r.status === "ACTIVE");
  return {
    count: active.length,
    totalCents: active.reduce((a, r) => a + r.amountCents, 0),
    earlyTotalCents: active.reduce((a, r) => a + (r.earlyCents ?? r.amountCents), 0),
  };
}

/** AC-8 (Q-89): a changed installment needs a valid date and a positive amount. */
export function validateAdjustment(a: { dueDate: string; amountCents: number }) {
  const errors: Record<string, string> = {};
  if (!isDay(a.dueDate)) errors.dueDate = "invalidDate";
  if (!Number.isInteger(a.amountCents) || a.amountCents <= 0) errors.amount = "range";
  return errors;
}
