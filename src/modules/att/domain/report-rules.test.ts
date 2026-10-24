import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLD,
  aggregate,
  isBelow,
  percentOf,
  resolveThreshold,
  summarize,
  type MarkFact,
} from "./report-rules";

describe("threshold (AC-2)", () => {
  it("accepts whole numbers 0..100, else 75", () => {
    expect(resolveThreshold(60)).toBe(60);
    expect(resolveThreshold(0)).toBe(0);
    expect(resolveThreshold(100)).toBe(100);
    for (const bad of [101, -1, 7.5, "80", null, undefined])
      expect(resolveThreshold(bad)).toBe(DEFAULT_THRESHOLD);
  });
  it("flags strictly below only, and never without a percentage", () => {
    expect(isBelow(74.9, 75)).toBe(true);
    expect(isBelow(75, 75)).toBe(false);
    expect(isBelow(null, 75)).toBe(false);
  });
});

describe("summarize (AC-1)", () => {
  it("counts hours, excused as absent for the percentage", () => {
    const f = summarize([
      { hours: 2, status: "PRESENT" },
      { hours: 2, status: "ABSENT" },
      { hours: 1, status: "EXCUSED" },
      { hours: 3, status: "PRESENT" },
    ]);
    expect(f).toMatchObject({
      classes: 4,
      heldHours: 8,
      presentHours: 5,
      absentHours: 2,
      excusedHours: 1,
    });
    expect(f.percent).toBe(62.5);
  });
  it("has no percentage without hours", () => {
    expect(summarize([]).percent).toBeNull();
    expect(percentOf(0, 0)).toBeNull();
  });
  it("rounds to one decimal", () => {
    expect(percentOf(2, 3)).toBe(66.7);
  });
});

describe("aggregate (AC-1, AC-4)", () => {
  const m = (
    studentId: string,
    sessionId: string,
    status: MarkFact["status"],
    hours = 2,
  ): MarkFact => ({ studentId, assignmentId: "A", sessionId, hours, status });
  it("groups per student and assignment and summarizes the assignment", () => {
    const { students, assignments } = aggregate(
      [
        m("s1", "x", "PRESENT"),
        m("s1", "y", "PRESENT"),
        m("s2", "x", "PRESENT"),
        m("s2", "y", "ABSENT"),
        { ...m("s3", "y", "PRESENT"), assignmentId: "B" },
      ],
      75,
    );
    expect(students.find((s) => s.studentId === "s1")?.percent).toBe(100);
    expect(students.find((s) => s.studentId === "s2")?.percent).toBe(50);
    const a = assignments.find((x) => x.assignmentId === "A")!;
    expect(a).toMatchObject({ classes: 2, heldHours: 4, students: 2, averagePercent: 75, below: 1 });
    expect(assignments.find((x) => x.assignmentId === "B")).toMatchObject({
      students: 1,
      below: 0,
    });
  });
});
