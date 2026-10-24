// AC-12: money is a decimal string at the edges (Decimal(12,2) in the database) and whole cents
// (integers) in the domain — never a floating point number.

/** Largest amount a Decimal(12,2) holds, in cents. */
export const MAX_CENTS = 999_999_999_999;

/** "1234.5" -> 123450; null when it is not a plain amount with at most two decimals. */
export function parseCents(value: string): number | null {
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** 123450 -> "1234.50" */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** The decimal string of a Prisma `Decimal` (or anything that prints as one) as cents. */
export function centsOf(value: { toString(): string }): number {
  const cents = parseCents(value.toString());
  if (cents === null) throw new Error("Not a money amount");
  return cents;
}

/** Splits `total` in proportion to `weights`; the parts add up to `total` exactly (the rest goes last). */
export function shares(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  const parts = weights.map((w) => Number((BigInt(total) * BigInt(w)) / BigInt(sum)));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

/** `cents * hundredths / 10000`, rounded half up, without leaving the integers. */
export function percentOf(cents: number, hundredths: number): number {
  const n = BigInt(cents) * BigInt(hundredths);
  return Number((n + 5000n) / 10000n);
}
