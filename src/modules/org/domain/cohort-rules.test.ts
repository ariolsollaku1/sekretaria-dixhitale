import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROUP_NAME,
  expectedYearOfStudy,
  planBulkGroups,
  resolveDefaultGroupName,
  yearNotBeforeCohort,
} from "./cohort-rules";
import { cohortSchema, groupSchema } from "./schemas";

const years = [
  { id: "y27", startDate: "2027-09-01" },
  { id: "y25", startDate: "2025-09-01" },
  { id: "y26", startDate: "2026-09-01" },
];

describe("expectedYearOfStudy (AC-10)", () => {
  it("counts academic years from the cohort's start year, whatever the input order", () => {
    expect(expectedYearOfStudy(years, "y25", "y25")).toBe(1);
    expect(expectedYearOfStudy(years, "y25", "y26")).toBe(2);
    expect(expectedYearOfStudy(years, "y25", "y27")).toBe(3);
  });
  it("is null before the start or for unknown years", () => {
    expect(expectedYearOfStudy(years, "y26", "y25")).toBeNull();
    expect(expectedYearOfStudy(years, "nope", "y25")).toBeNull();
    expect(expectedYearOfStudy(years, "y25", "nope")).toBeNull();
  });
});

describe("planBulkGroups (AC-9)", () => {
  const cohort = (
    id: string,
    start: string,
    duration: number,
    existing: [number, number][] = [],
  ) => ({
    id,
    name: id,
    startAcademicYearId: start,
    durationYears: duration,
    activeGroupsByYear: new Map(existing),
  });
  it("plans one default group per cohort and expected year, skipping what exists or does not apply", () => {
    const plan = planBulkGroups(
      years,
      "y26",
      [
        cohort("a", "y25", 3), // year 2 -> create
        cohort("b", "y26", 1), // year 1 -> create
        cohort("c", "y25", 1), // year 2 beyond a 1-year program -> skip
        cohort("d", "y27", 3), // not started yet -> skip
        cohort("e", "y25", 3, [[2, 1]]), // already has a group -> skip
      ],
      "Grupi 1",
    );
    expect(plan).toEqual([
      { cohortId: "a", cohortName: "a", yearOfStudy: 2, name: "Grupi 1" },
      { cohortId: "b", cohortName: "b", yearOfStudy: 1, name: "Grupi 1" },
    ]);
  });
});

describe("defaults and ranges", () => {
  it("falls back to the default group name", () => {
    expect(resolveDefaultGroupName(" Grupi A ")).toBe("Grupi A");
    for (const bad of [undefined, null, "", "  ", 3, "x".repeat(101)])
      expect(resolveDefaultGroupName(bad)).toBe(DEFAULT_GROUP_NAME);
  });
  it("accepts groups from the cohort's start year on", () => {
    expect(yearNotBeforeCohort("2026-09-01", "2026-09-01")).toBe(true);
    expect(yearNotBeforeCohort("2025-09-01", "2026-09-01")).toBe(false);
  });
  it("validates cohort and group input", () => {
    expect(
      cohortSchema.safeParse({
        programId: "p",
        startAcademicYearId: "y",
        curriculumPlanId: "c",
        name: " ",
      }).success,
    ).toBe(false);
    const g = { cohortId: "c", academicYearId: "y", yearOfStudy: 1, name: "G" };
    expect(groupSchema.parse({ ...g, capacity: 30 }).capacity).toBe(30);
    expect(groupSchema.parse(g).capacity).toBeNull();
    for (const bad of [
      { yearOfStudy: 0 },
      { capacity: 0 },
      { capacity: 1001 },
      { capacity: 2.5 },
      { name: "x".repeat(101) },
    ])
      expect(groupSchema.safeParse({ ...g, ...bad }).success).toBe(false);
  });
});
