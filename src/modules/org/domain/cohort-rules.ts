// Pure cohort and group rules (ORG-04). No I/O.

export type YearRef = { id: string; startDate: string };

/**
 * AC-10: the expected year of study of a cohort in an academic year = the number of academic years
 * from the cohort's start year (by start date) plus one. Returns null when the year is before the
 * cohort's start or unknown.
 */
export function expectedYearOfStudy(
  years: readonly YearRef[],
  startYearId: string,
  yearId: string,
): number | null {
  const ordered = [...years].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const from = ordered.findIndex((y) => y.id === startYearId);
  const to = ordered.findIndex((y) => y.id === yearId);
  if (from < 0 || to < 0 || to < from) return null;
  return to - from + 1;
}

export type BulkCohort = {
  id: string;
  name: string;
  startAcademicYearId: string;
  durationYears: number;
  /** year of study -> number of active groups the cohort already has in the year */
  activeGroupsByYear: ReadonlyMap<number, number>;
};

export type BulkGroup = { cohortId: string; cohortName: string; yearOfStudy: number; name: string };

/** AC-9: the groups the start-of-year tool would create; nothing when they exist already. */
export function planBulkGroups(
  years: readonly YearRef[],
  yearId: string,
  cohorts: readonly BulkCohort[],
  defaultName: string,
): BulkGroup[] {
  const out: BulkGroup[] = [];
  for (const c of cohorts) {
    const expected = expectedYearOfStudy(years, c.startAcademicYearId, yearId);
    if (expected === null || expected > c.durationYears) continue;
    if ((c.activeGroupsByYear.get(expected) ?? 0) > 0) continue;
    out.push({ cohortId: c.id, cohortName: c.name, yearOfStudy: expected, name: defaultName });
  }
  return out;
}

export const DEFAULT_GROUP_NAME = "Grupi 1";

/** AC-9: the setting `org.defaultGroupName`; anything unusable falls back to the default. */
export function resolveDefaultGroupName(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" && value.trim().length <= 100
    ? value.trim()
    : DEFAULT_GROUP_NAME;
}

/** AC-7: a group cannot belong to a year that starts before its cohort. */
export const yearNotBeforeCohort = (yearStart: string, cohortStartYearStart: string): boolean =>
  yearStart >= cohortStartYearStart;
