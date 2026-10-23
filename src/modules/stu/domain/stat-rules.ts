// Pure cross-tab rules for student statistics (STU-04). No I/O.
export const DIMENSIONS = [
  "faculty",
  "cycle",
  "program",
  "yearOfStudy",
  "gender",
  "residence",
  "ageBand",
  "status",
  "registrationType",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type StatRecord = Record<Dimension, string>;

export const AGE_BANDS = ["<20", "20-24", "25-29", "30-39", "40+"] as const;
export function ageBand(age: number): (typeof AGE_BANDS)[number] {
  return age < 20 ? "<20" : age < 25 ? "20-24" : age < 30 ? "25-29" : age < 40 ? "30-39" : "40+";
}

export type Pivot = {
  rows: string[];
  cols: string[];
  cell: (row: string, col: string) => number;
  rowTotal: (row: string) => number;
  colTotal: (col: string) => number;
  total: number;
};

const natural = (a: string, b: string) => {
  const aEmpty = a === "";
  const bEmpty = b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1; // empty last
  const bandA = AGE_BANDS.indexOf(a as never);
  const bandB = AGE_BANDS.indexOf(b as never);
  if (bandA >= 0 && bandB >= 0) return bandA - bandB;
  return a.localeCompare(b, undefined, { numeric: true });
};

/** AC-1/AC-5: counts per (row, column); equal dimensions collapse to a single count column. */
export function pivot(
  records: readonly StatRecord[],
  rowDim: Dimension,
  colDim: Dimension | null,
): Pivot {
  const single = colDim === null || colDim === rowDim;
  const counts = new Map<string, number>();
  const rowT = new Map<string, number>();
  const colT = new Map<string, number>();
  for (const r of records) {
    const row = r[rowDim];
    const col = single ? "" : r[colDim!];
    counts.set(`${row}\u0000${col}`, (counts.get(`${row}\u0000${col}`) ?? 0) + 1);
    rowT.set(row, (rowT.get(row) ?? 0) + 1);
    colT.set(col, (colT.get(col) ?? 0) + 1);
  }
  return {
    rows: [...rowT.keys()].sort(natural),
    cols: single ? [] : [...colT.keys()].sort(natural),
    cell: (row, col) => counts.get(`${row}\u0000${single ? "" : col}`) ?? 0,
    rowTotal: (row) => rowT.get(row) ?? 0,
    colTotal: (col) => colT.get(single ? "" : col) ?? 0,
    total: records.length,
  };
}

export const isDimension = (v: unknown): v is Dimension =>
  (DIMENSIONS as readonly string[]).includes(String(v));

/** Whole years between a birth day and `today` (`YYYY-MM-DD`). */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
