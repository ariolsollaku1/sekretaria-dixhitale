// Pure rules for the entry qualifications report (STU-05, SRC-022). No I/O. Working assumptions: Q-148.
export const BANDS = ["lt6", "6", "7", "8", "9"] as const;
export type Band = (typeof BANDS)[number];

/** Scale 5-10 (Q-122): under 6, 6-6.99, 7-7.99, 8-8.99, 9-10. */
export function gradeBand(average: number): Band {
  return average < 6 ? "lt6" : average < 7 ? "6" : average < 8 ? "7" : average < 9 ? "8" : "9";
}

export type EntryRecord = {
  program: string;
  /** null when the enrollment did not come from an application (AC-5). */
  average: number | null;
};

export type Stats = { n: number; mean: number; min: number; max: number };

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function stats(values: readonly number[]): Stats | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    n: values.length,
    mean: round2(sum / values.length),
    min: round2(Math.min(...values)),
    max: round2(Math.max(...values)),
  };
}

const known = (records: readonly EntryRecord[]) =>
  records.flatMap((r) => (r.average === null ? [] : [r.average]));

/** AC-2 */
export function summarize(records: readonly EntryRecord[]) {
  const withAverage = known(records).length;
  return {
    total: records.length,
    withAverage,
    withoutAverage: records.length - withAverage,
    overall: stats(known(records)),
  };
}

/** AC-3: every band is present, also with zero; share is of the enrollments with an average. */
export function distribution(records: readonly EntryRecord[]) {
  const values = known(records);
  return BANDS.map((band) => {
    const count = values.filter((v) => gradeBand(v) === band).length;
    return { band, count, share: values.length ? round2((count / values.length) * 100) : 0 };
  });
}

/** AC-4: one row per program that has at least one average, ordered by program code. */
export function byProgram(records: readonly EntryRecord[]) {
  const programs = [...new Set(records.map((r) => r.program))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  return programs.flatMap((program) => {
    const s = stats(known(records.filter((r) => r.program === program)));
    return s ? [{ program, ...s }] : [];
  });
}
