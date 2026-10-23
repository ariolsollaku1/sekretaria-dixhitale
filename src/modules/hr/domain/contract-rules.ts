// Pure contract-expiry rules (HR-03). Days are `YYYY-MM-DD` strings; no time zones involved.
export type ContractState = "ENDED" | "ENDING_SOON" | "OK";

export const DEFAULT_HORIZON_DAYS = 60;

/** AC-1: the setting `hr.contractHorizonDays`; anything unusable falls back to the default. */
export function resolveHorizonDays(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 3650
    ? value
    : DEFAULT_HORIZON_DAYS;
}

const DAY_MS = 86_400_000;
const ms = (day: string) => new Date(`${day}T00:00:00Z`).getTime();

/** Whole days from `today` to `end` (negative once the contract has ended). */
export const daysLeft = (end: string, today: string): number =>
  Math.round((ms(end) - ms(today)) / DAY_MS);

/**
 * AC-1: an employed member with an end date is ENDED when it is before today and ENDING_SOON when
 * it is today or within the horizon; everything else is OK (no end date, not employed, far away).
 */
export function classifyContract(input: {
  active: boolean;
  contractEnd: string | null;
  today: string;
  horizonDays: number;
}): ContractState {
  if (!input.active || !input.contractEnd) return "OK";
  const left = daysLeft(input.contractEnd, input.today);
  if (left < 0) return "ENDED";
  return left <= input.horizonDays ? "ENDING_SOON" : "OK";
}

/** The ISO week key used to send one notice per week (`2026-W43`). */
export function isoWeekKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // the Thursday of this week decides the year
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / DAY_MS -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
