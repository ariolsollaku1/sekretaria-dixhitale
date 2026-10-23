// Pure curriculum-plan rules (CUR-02): totals, warnings, ranges. No I/O.
import { MAX_CREDITS, MAX_HOURS } from "./course-rules";

export const DEFAULT_CREDITS_PER_SEMESTER = 30;
export const SEMESTERS = [1, 2] as const;

/** AC-5: the setting `cur.plan.creditsPerSemester`; anything unusable falls back to the default. */
export function resolveCreditsPerSemester(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_CREDITS
    ? value
    : DEFAULT_CREDITS_PER_SEMESTER;
}

export type PlanCourseFigures = {
  yearOfStudy: number;
  semester: number;
  credits: number;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
};

export type Sums = {
  count: number;
  credits: number;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
};
const empty = (): Sums => ({ count: 0, credits: 0, hoursLecture: 0, hoursSeminar: 0, hoursLab: 0 });
function add(sum: Sums, c: PlanCourseFigures): Sums {
  sum.count += 1;
  sum.credits += c.credits;
  sum.hoursLecture += c.hoursLecture;
  sum.hoursSeminar += c.hoursSeminar;
  sum.hoursLab += c.hoursLab;
  return sum;
}

export type PlanWarning =
  | { kind: "semesterCredits"; year: number; semester: number; expected: number; actual: number }
  | { kind: "totalCredits"; expected: number; actual: number };

export type PlanTotals = {
  /** every year 1..duration, both semesters, even when empty */
  years: { year: number; semesters: { semester: number; sums: Sums }[]; sums: Sums }[];
  total: Sums;
  warnings: PlanWarning[];
};

/**
 * AC-5: totals per semester, year and plan, and warnings (never blockers) where a semester differs
 * from the configured credits or the plan differs from the program's total credits.
 */
export function planTotals(
  courses: readonly PlanCourseFigures[],
  opts: { durationYears: number; creditsPerSemester: number; programTotalCredits: number },
): PlanTotals {
  const total = empty();
  const years: PlanTotals["years"] = [];
  const warnings: PlanWarning[] = [];
  for (let year = 1; year <= opts.durationYears; year++) {
    const yearSums = empty();
    const semesters = SEMESTERS.map((semester) => {
      const sums = empty();
      for (const c of courses) if (c.yearOfStudy === year && c.semester === semester) add(sums, c);
      for (const key of ["count", "credits", "hoursLecture", "hoursSeminar", "hoursLab"] as const) {
        yearSums[key] += sums[key];
        total[key] += sums[key];
      }
      if (sums.credits !== opts.creditsPerSemester)
        warnings.push({
          kind: "semesterCredits",
          year,
          semester,
          expected: opts.creditsPerSemester,
          actual: sums.credits,
        });
      return { semester, sums };
    });
    years.push({ year, semesters, sums: yearSums });
  }
  // courses placed beyond the duration (cannot happen through the service) still count in the total
  for (const c of courses) if (c.yearOfStudy > opts.durationYears) add(total, c);
  if (total.credits !== opts.programTotalCredits)
    warnings.push({
      kind: "totalCredits",
      expected: opts.programTotalCredits,
      actual: total.credits,
    });
  return { years, total, warnings };
}

export type PlacementErrors = Partial<
  Record<"yearOfStudy" | "semester" | "credits" | "hours", string>
>;

/** AC-2/AC-3: year and semester must exist in the program; figures within the catalog's limits. */
export function validatePlacement(
  c: Pick<PlanCourseFigures, "yearOfStudy" | "semester" | "credits"> &
    Partial<Pick<PlanCourseFigures, "hoursLecture" | "hoursSeminar" | "hoursLab">>,
  durationYears: number,
): PlacementErrors {
  const errors: PlacementErrors = {};
  if (!Number.isInteger(c.yearOfStudy) || c.yearOfStudy < 1 || c.yearOfStudy > durationYears)
    errors.yearOfStudy = "yearOutOfRange";
  if (c.semester !== 1 && c.semester !== 2) errors.semester = "semesterOutOfRange";
  if (!Number.isInteger(c.credits) || c.credits < 0 || c.credits > MAX_CREDITS)
    errors.credits = "creditsRange";
  for (const h of [c.hoursLecture, c.hoursSeminar, c.hoursLab])
    if (h !== undefined && (!Number.isInteger(h) || h < 0 || h > MAX_HOURS))
      errors.hours = "hoursRange";
  return errors;
}

/** AC-1/AC-6: versions increment per program. */
export const nextVersion = (existing: readonly number[]): number =>
  existing.length === 0 ? 1 : Math.max(...existing) + 1;
