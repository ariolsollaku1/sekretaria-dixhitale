// FIN-02: pure payment rules in whole cents (AC-12 of FIN-01: never floating point).
// Allocation is computed from the recorded payments and the current installments, not stored.

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type InstallmentInput = {
  id: string;
  dueDate: string;
  sequence: number;
  amountCents: number;
  earlyCents: number | null;
  earlyUntil: string | null;
};
export type PaymentInput = {
  id: string;
  paidOn: string;
  amountCents: number;
  /** The installment the payer meant to pay; paid first (Q-109). */
  installmentId: string | null;
  /** Tie-break for payments of one day: the order they were recorded in. */
  order: number;
};

export type InstallmentStatus = "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE";
export type InstallmentBalance = {
  id: string;
  paidCents: number;
  /** Part of the amount waived because the early amount was paid in time (Q-110). */
  waivedCents: number;
  outstandingCents: number;
  settledEarly: boolean;
  status: InstallmentStatus;
};

export type PlanBalance = {
  installments: InstallmentBalance[];
  /** What the plan asks for: full amounts less early waivers. */
  dueCents: number;
  paidCents: number;
  outstandingCents: number;
  /** Outstanding on installments due before `asOf`. */
  overdueCents: number;
  /** Paid above what the plan asks for (Q-109). */
  creditCents: number;
};

/** "YYYY-MM-DD" of an instant in Europe/Tirane (display zone, conventions). */
export function dayInTirane(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * AC-3, AC-4, AC-5 (Q-109, Q-110): spreads the payments over the installments.
 * Payments are processed by date; each pays its chosen installment first, then the oldest unpaid.
 * An installment is settled by its early amount when payments dated up to its early-until date reach it.
 */
export function planBalance(
  installments: InstallmentInput[],
  payments: PaymentInput[],
  asOf: string,
): PlanBalance {
  const ordered = [...installments].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence,
  );
  const state = new Map(ordered.map((i) => [i.id, { paid: 0, early: false }]));
  const byDate = [...payments].sort(
    (a, b) => a.paidOn.localeCompare(b.paidOn) || a.order - b.order,
  );

  let credit = 0;
  for (const p of byDate) {
    let rest = p.amountCents;
    const chosen = ordered.find((i) => i.id === p.installmentId);
    const queue = chosen ? [chosen, ...ordered.filter((i) => i !== chosen)] : ordered;
    for (const inst of queue) {
      if (rest <= 0) break;
      const s = state.get(inst.id)!;
      if (s.early) continue;
      const useEarly =
        inst.earlyCents !== null && inst.earlyUntil !== null && p.paidOn <= inst.earlyUntil;
      const target = useEarly ? inst.earlyCents! : inst.amountCents;
      const need = Math.max(0, target - s.paid);
      if (need === 0) continue;
      const take = Math.min(rest, need);
      s.paid += take;
      rest -= take;
      if (useEarly && s.paid >= inst.earlyCents!) s.early = true;
    }
    credit += rest;
  }

  const lines = ordered.map((inst): InstallmentBalance => {
    const s = state.get(inst.id)!;
    const waived = s.early ? Math.max(0, inst.amountCents - s.paid) : 0;
    const outstanding = s.early ? 0 : Math.max(0, inst.amountCents - s.paid);
    const status: InstallmentStatus =
      outstanding === 0
        ? "PAID"
        : inst.dueDate < asOf
          ? "OVERDUE"
          : s.paid > 0
            ? "PARTIAL"
            : "UNPAID";
    return {
      id: inst.id,
      paidCents: s.paid,
      waivedCents: waived,
      outstandingCents: outstanding,
      settledEarly: s.early,
      status,
    };
  });
  const sum = (f: (l: InstallmentBalance, i: InstallmentInput) => number) =>
    lines.reduce((a, l, idx) => a + f(l, ordered[idx]!), 0);
  return {
    installments: lines,
    dueCents: sum((l, i) => i.amountCents - l.waivedCents),
    paidCents: sum((l) => l.paidCents),
    outstandingCents: sum((l) => l.outstandingCents),
    overdueCents: sum((l, i) => (i.dueDate < asOf ? l.outstandingCents : 0)),
    creditCents: credit,
  };
}

/** Outstanding on installments due on or before `date` (AC-6, Q-111). */
export function owedOn(
  installments: InstallmentInput[],
  balance: PlanBalance,
  date: string,
): number {
  const due = new Map(installments.map((i) => [i.id, i.dueDate]));
  return balance.installments.reduce(
    (a, l) => a + ((due.get(l.id) ?? "9999") <= date ? l.outstandingCents : 0),
    0,
  );
}

export type Clearance = { cleared: boolean; owedCents: number };

/** AC-6 (Q-111): cleared when nothing due on or before `date` is outstanding in any plan. */
export function clearance(
  plans: { installments: InstallmentInput[]; payments: PaymentInput[] }[],
  date: string,
): Clearance {
  let owed = 0;
  for (const p of plans) {
    const b = planBalance(p.installments, p.payments, date);
    owed += owedOn(p.installments, b, date);
  }
  return { cleared: owed === 0, owedCents: owed };
}
