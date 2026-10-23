import { describe, expect, it } from "vitest";
import { addPlanCourseSchema } from "./plan-schemas";
import {
  nextVersion,
  planTotals,
  resolveCreditsPerSemester,
  validatePlacement,
  type PlanCourseFigures,
} from "./plan-rules";

const c = (
  yearOfStudy: number,
  semester: number,
  credits: number,
  h = [30, 15, 0],
): PlanCourseFigures => ({
  yearOfStudy,
  semester,
  credits,
  hoursLecture: h[0]!,
  hoursSeminar: h[1]!,
  hoursLab: h[2]!,
});

describe("planTotals (AC-5)", () => {
  const opts = { durationYears: 2, creditsPerSemester: 30, programTotalCredits: 120 };
  it("sums credits and hours per semester, year and plan with no warnings for a complete plan", () => {
    const courses = [c(1, 1, 30), c(1, 2, 30), c(2, 1, 20), c(2, 1, 10), c(2, 2, 30)];
    const t = planTotals(courses, opts);
    expect(t.total.credits).toBe(120);
    expect(t.total.count).toBe(5);
    expect(t.total.hoursLecture).toBe(150);
    expect(t.years[1]!.semesters[0]!.sums).toMatchObject({
      count: 2,
      credits: 30,
      hoursSeminar: 30,
    });
    expect(t.years[1]!.sums.credits).toBe(60);
    expect(t.warnings).toEqual([]);
  });
  it("warns about every semester that differs and about the plan total", () => {
    const t = planTotals([c(1, 1, 28), c(1, 2, 30), c(2, 1, 30)], opts);
    expect(t.warnings).toEqual([
      { kind: "semesterCredits", year: 1, semester: 1, expected: 30, actual: 28 },
      { kind: "semesterCredits", year: 2, semester: 2, expected: 30, actual: 0 },
      { kind: "totalCredits", expected: 120, actual: 88 },
    ]);
  });
  it("lists empty years and semesters for the whole duration", () => {
    const t = planTotals([], { ...opts, durationYears: 3 });
    expect(t.years.map((y) => y.year)).toEqual([1, 2, 3]);
    expect(t.years.every((y) => y.semesters.length === 2)).toBe(true);
    expect(t.warnings).toHaveLength(7);
  });
});

describe("validatePlacement (AC-2, AC-3)", () => {
  it("accepts valid placements and refuses out-of-range values", () => {
    expect(validatePlacement({ yearOfStudy: 3, semester: 2, credits: 6 }, 3)).toEqual({});
    expect(validatePlacement({ yearOfStudy: 4, semester: 1, credits: 6 }, 3)).toEqual({
      yearOfStudy: "yearOutOfRange",
    });
    expect(validatePlacement({ yearOfStudy: 0, semester: 1, credits: 6 }, 3).yearOfStudy).toBe(
      "yearOutOfRange",
    );
    expect(validatePlacement({ yearOfStudy: 1, semester: 3, credits: 6 }, 3).semester).toBe(
      "semesterOutOfRange",
    );
    expect(validatePlacement({ yearOfStudy: 1, semester: 1, credits: 61 }, 3).credits).toBe(
      "creditsRange",
    );
    expect(validatePlacement({ yearOfStudy: 1, semester: 1, credits: -1 }, 3).credits).toBe(
      "creditsRange",
    );
    expect(
      validatePlacement({ yearOfStudy: 1, semester: 1, credits: 6, hoursLab: 501 }, 3).hours,
    ).toBe("hoursRange");
  });
});

describe("settings and versions", () => {
  it("falls back to 30 credits per semester for unusable settings", () => {
    expect(resolveCreditsPerSemester(25)).toBe(25);
    for (const bad of [undefined, null, "30", 0, 61, 2.5, NaN])
      expect(resolveCreditsPerSemester(bad)).toBe(30);
  });
  it("increments the version per program", () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([1, 3, 2])).toBe(4);
  });
});

describe("addPlanCourseSchema (AC-2)", () => {
  const base = { planId: "p", courseId: "c", yearOfStudy: 1, semester: 1 };
  it("leaves credits, category and hours out so the catalog's apply", () => {
    const r = addPlanCourseSchema.parse(base);
    expect(r).toMatchObject({ isElective: false });
    expect(r.credits).toBeUndefined();
  });
  it.each([
    [{ semester: 3 }, "semester"],
    [{ yearOfStudy: 0 }, "yearOfStudy"],
    [{ credits: 61 }, "credits"],
    [{ credits: 2.5 }, "credits"],
    [{ hoursLab: 501 }, "hoursLab"],
    [{ courseId: "" }, "courseId"],
  ])("refuses %j", (patch, field) => {
    const r = addPlanCourseSchema.safeParse({ ...base, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
  });
});
