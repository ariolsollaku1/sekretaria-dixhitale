const DAY_MS = 86_400_000;
const utcDay = (d: string) => Date.parse(`${d}T00:00:00Z`);

export type ContractProgress = {
  /** 0–100 share of the contract already elapsed; null without an end date. */
  percent: number | null;
  /** Whole days until the end date (negative once ended); null without an end date. */
  daysLeft: number | null;
};

/** Display only (the record page): how far along a contract is. Expiry alerts are HR-03's job. */
export function contractProgress(
  start: string,
  end: string | null,
  now: number = Date.now(),
): ContractProgress {
  if (!end) return { percent: null, daysLeft: null };
  const s = utcDay(start);
  const e = utcDay(end);
  const percent = e > s ? Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100)) : null;
  return { percent, daysLeft: Math.ceil((e - now) / DAY_MS) };
}
