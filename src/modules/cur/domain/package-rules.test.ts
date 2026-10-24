import { describe, expect, it } from "vitest";
import {
  groupSemesters,
  packageCounts,
  pickSyllabus,
  selfLimitReached,
  templateData,
  type PackageCourse,
} from "./package-rules";

const cand = (id: string, academicYearId: string, yearStart: string) => ({
  id,
  fileId: `f-${id}`,
  academicYearId,
  yearStart,
});

const course = (over: Partial<PackageCourse>): PackageCourse => ({
  planCourseId: "p",
  yearOfStudy: 1,
  semester: 1,
  code: "A",
  name: "A",
  credits: 5,
  hoursLecture: 30,
  hoursSeminar: 15,
  hoursLab: 0,
  isElective: false,
  hasSyllabus: true,
  ...over,
});

describe("pickSyllabus (AC-3)", () => {
  const y24 = cand("s24", "y24", "2024-09-01");
  const y25 = cand("s25", "y25", "2025-09-01");
  const y26 = cand("s26", "y26", "2026-09-01");

  it("prefers the syllabus of the year the student studied the course", () => {
    expect(pickSyllabus([y24, y25, y26], "y25")?.id).toBe("s25");
  });
  it("falls back to the most recent year when the preferred year has none", () => {
    expect(pickSyllabus([y24, y26, y25], "y99")?.id).toBe("s26");
    expect(pickSyllabus([y24, y25], null)?.id).toBe("s25");
  });
  it("returns null without candidates", () => {
    expect(pickSyllabus([], "y25")).toBeNull();
  });
});

describe("groupSemesters / packageCounts", () => {
  const courses = [
    course({ code: "B", yearOfStudy: 1, semester: 2, credits: 4 }),
    course({ code: "C", yearOfStudy: 2, semester: 1, credits: 6, hasSyllabus: false }),
    course({ code: "A", yearOfStudy: 1, semester: 1, credits: 5, isElective: true }),
    course({ code: "A2", yearOfStudy: 1, semester: 1, credits: 3 }),
  ];

  it("orders by year, semester and code and totals each group", () => {
    const groups = groupSemesters(courses);
    expect(groups.map((g) => [g.yearOfStudy, g.semester, g.credits])).toEqual([
      [1, 1, 8],
      [1, 2, 4],
      [2, 1, 6],
    ]);
    expect(groups[0]!.courses.map((c) => c.code)).toEqual(["A", "A2"]);
    expect(groups[0]!.courses[0]).toMatchObject({ elective: true, hours: "30/15/0" });
    expect(groups[2]!.courses[0]).toMatchObject({ hasSyllabus: false, noSyllabus: true });
  });
  it("counts courses, included and missing syllabi and credits", () => {
    expect(packageCounts(courses)).toEqual({ courses: 4, included: 3, missing: 1, credits: 18 });
    expect(packageCounts([])).toEqual({ courses: 0, included: 0, missing: 0, credits: 0 });
  });
  it("builds the template data", () => {
    const data = templateData({
      program: { code: "P", name: "Prog", cycle: "FIRST" },
      student: { name: "N", number: "000001" },
      cohort: "C",
      planVersion: 2,
      planFrom: "2024-2025",
      courses,
    });
    expect(data).toMatchObject({ totalCredits: 18, missingCount: 1, hasMissing: true });
    expect((data.semesters as { label: string }[]).map((s) => s.label)).toEqual([
      "1.1",
      "1.2",
      "2.1",
    ]);
  });
});

describe("selfLimitReached (AC-8)", () => {
  it("allows three per window", () => {
    expect([0, 1, 2, 3, 4].map(selfLimitReached)).toEqual([false, false, false, true, true]);
  });
});
