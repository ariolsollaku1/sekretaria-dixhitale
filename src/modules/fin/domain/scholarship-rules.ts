// Pure rules of scholarships (FIN-03). No I/O. Money is whole cents; percentages are hundredths of
// a percent (10.5 % = 1050), like the discounts of FIN-01.
import { percentOf } from "./money";

export const SCHOLARSHIP_TYPES = ["FULL", "PARTIAL"] as const;
export type ScholarshipType = (typeof SCHOLARSHIP_TYPES)[number];
// Q-23 (research): excellence, need and disability scholarships; OTHER for anything else.
export const SCHOLARSHIP_CATEGORIES = ["EXCELLENCE", "NEED", "DISABILITY", "OTHER"] as const;
export type ScholarshipCategory = (typeof SCHOLARSHIP_CATEGORIES)[number];

export const SCHOLARSHIP_HANDLER = "fin.scholarship";

/** What a scholarship takes off: everything, a percentage, or a fixed amount of the year's tuition. */
export type Terms =
  | { type: "FULL" }
  | { type: "PARTIAL"; percent: number; amount?: undefined }
  | { type: "PARTIAL"; amount: number; percent?: undefined };

export type TermsDraft = { type: ScholarshipType; percent?: number | null; amount?: number | null };

/** AC-1: FULL carries no value; PARTIAL exactly one of a percentage (above 0, below 100) or an amount. */
export function validateTerms(d: TermsDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const hasPercent = d.percent !== null && d.percent !== undefined;
  const hasAmount = d.amount !== null && d.amount !== undefined;
  if (d.type === "FULL") {
    if (hasPercent || hasAmount) errors.type = "fullHasValue";
    return errors;
  }
  if (hasPercent === hasAmount) errors.value = "oneValue";
  else if (hasPercent && (!Number.isInteger(d.percent) || d.percent! <= 0 || d.percent! >= 10000))
    errors.percent = "range";
  else if (hasAmount && (!Number.isInteger(d.amount) || d.amount! <= 0)) errors.amount = "range";
  return errors;
}

export type TuitionRow = { id: string; amountCents: number };
export type Cut = { installmentId: string; cutCents: number; cancels: boolean };
export type CutResult =
  { ok: true; cuts: Cut[] } | { ok: false; code: "noTuition" | "exceedsTuition" };

/**
 * Splits `total` over `weights` in proportion, in whole cents, so that no part exceeds its weight
 * and the parts add up to `total` exactly (needs `total <= sum(weights)`). Leftover cents go to the
 * last installments that still have room.
 */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) =>
    sum === 0 ? 0 : Number((BigInt(total) * BigInt(w)) / BigInt(sum)),
  );
  let rest = total - parts.reduce((a, b) => a + b, 0);
  for (let i = parts.length - 1; i >= 0 && rest > 0; i--) {
    const room = (weights[i] ?? 0) - (parts[i] ?? 0);
    const add = Math.min(room, rest);
    parts[i] = (parts[i] ?? 0) + add;
    rest -= add;
  }
  return parts;
}

/**
 * AC-4 (Q-23, Q-141): the reduction of each tuition installment of the plan. FULL takes everything,
 * a percentage takes that share of each installment (rounded half up), an amount is shared over
 * the installments in proportion and may not exceed the tuition. An installment reduced to its
 * whole amount is cancelled (`cancels`), the others keep a lower amount. Installments with nothing
 * to take are left out.
 */
export function computeCuts(rows: TuitionRow[], terms: Terms): CutResult {
  const live = rows.filter((r) => r.amountCents > 0);
  if (live.length === 0) return { ok: false, code: "noTuition" };
  let cuts: number[];
  if (terms.type === "FULL") cuts = live.map((r) => r.amountCents);
  else if (terms.percent !== undefined)
    cuts = live.map((r) => percentOf(r.amountCents, terms.percent));
  else {
    const total = live.reduce((a, r) => a + r.amountCents, 0);
    if (terms.amount > total) return { ok: false, code: "exceedsTuition" };
    cuts = distribute(
      terms.amount,
      live.map((r) => r.amountCents),
    );
  }
  return {
    ok: true,
    cuts: live
      .map((r, i) => ({
        installmentId: r.id,
        cutCents: Math.min(cuts[i] ?? 0, r.amountCents),
        cancels: (cuts[i] ?? 0) >= r.amountCents,
      }))
      .filter((c) => c.cutCents > 0),
  };
}

/** SRC-083: the fee before the scholarship, the reduction and the fee after it. */
export function feeEffect(beforeCents: number, cutCents: number) {
  return { beforeCents, cutCents, afterCents: beforeCents - cutCents };
}

export type ReportRow = {
  yearCode: string;
  programCode: string;
  type: ScholarshipType;
  category: ScholarshipCategory;
};

/** SRC-084: counts per academic year and program, split by full / partial and by category. */
export function countScholarships(rows: ReportRow[]) {
  const map = new Map<
    string,
    {
      yearCode: string;
      programCode: string;
      total: number;
      full: number;
      partial: number;
      byCategory: Record<ScholarshipCategory, number>;
    }
  >();
  for (const r of rows) {
    const key = `${r.yearCode}|${r.programCode}`;
    let row = map.get(key);
    if (!row) {
      row = {
        yearCode: r.yearCode,
        programCode: r.programCode,
        total: 0,
        full: 0,
        partial: 0,
        byCategory: { EXCELLENCE: 0, NEED: 0, DISABILITY: 0, OTHER: 0 },
      };
      map.set(key, row);
    }
    row.total++;
    if (r.type === "FULL") row.full++;
    else row.partial++;
    row.byCategory[r.category]++;
  }
  return [...map.values()].sort(
    (a, b) => a.yearCode.localeCompare(b.yearCode) || a.programCode.localeCompare(b.programCode),
  );
}
