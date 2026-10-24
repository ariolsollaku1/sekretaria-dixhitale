// FIN-05: pure helpers of the shared payment lists (no I/O).

export const LIST_SESSION_TYPES = ["WINTER", "SUMMER", "AUTUMN", "MINI"] as const;
export type ListSessionType = (typeof LIST_SESSION_TYPES)[number];

/** The calendar day before `day` (YYYY-MM-DD), in UTC arithmetic. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** AC-3 (Q-143): "before the session" = up to the day before its first day. */
export const sessionClearanceDate = (sessionStart: string): string => dayBefore(sessionStart);

/** Sorts rows by a key accessor, ties by a stable second key; strings compare as plain text. */
export function sortRows<T>(
  rows: T[],
  key: (r: T) => string | number,
  dir: "asc" | "desc",
  tiebreak: (r: T) => string,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const c =
      typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c !== 0 ? sign * c : tiebreak(a).localeCompare(tiebreak(b));
  });
}

/** 1-based page of an already filtered and sorted list. */
export const pageRows = <T>(rows: T[], page: number, pageSize: number): T[] =>
  rows.slice((page - 1) * pageSize, page * pageSize);
