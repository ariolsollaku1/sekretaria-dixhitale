import { describe, expect, it } from "vitest";
import { cellState, nextSyllabusVersion, planCarryForward } from "./syllabus-rules";
import { carryForwardSchema, uploadSyllabusSchema } from "./syllabus-schemas";

describe("nextSyllabusVersion (AC-2)", () => {
  it("starts at 1 and follows the highest", () => {
    expect(nextSyllabusVersion([])).toBe(1);
    expect(nextSyllabusVersion([1, 3, 2])).toBe(4);
  });
});

describe("cellState (AC-8)", () => {
  const v = (version: number, status: "DRAFT" | "APPROVED" | "ARCHIVED") => ({
    id: `s${version}`,
    version,
    status,
  });
  it("is missing without live versions", () => {
    expect(cellState([]).state).toBe("missing");
    expect(cellState([v(1, "ARCHIVED")]).state).toBe("missing");
  });
  it("prefers the approved version and reports a waiting draft", () => {
    const c = cellState([v(1, "ARCHIVED"), v(2, "APPROVED"), v(3, "DRAFT")]);
    expect(c).toMatchObject({
      state: "approved",
      current: { version: 2 },
      draft: { version: 3 },
      versions: 3,
    });
  });
  it("shows the newest draft when nothing is approved", () => {
    const c = cellState([v(1, "DRAFT"), v(2, "DRAFT")]);
    expect(c).toMatchObject({ state: "draft", current: { version: 2 }, draft: null });
  });
});

describe("planCarryForward (AC-7)", () => {
  const sources = new Map([
    [
      "c1",
      [
        { syllabusId: "old", academicYearStart: "2024-09-01" },
        { syllabusId: "newer", academicYearStart: "2025-09-01" },
        { syllabusId: "later", academicYearStart: "2026-09-01" },
      ],
    ],
    ["c2", [{ syllabusId: "future", academicYearStart: "2027-09-01" }]],
  ]);
  it("takes the latest earlier approved syllabus and skips existing and sourceless courses", () => {
    const plan = planCarryForward(
      [
        { planCourseId: "p1", courseId: "c1", live: false },
        { planCourseId: "p2", courseId: "c2", live: false },
        { planCourseId: "p3", courseId: "c3", live: false },
        { planCourseId: "p4", courseId: "c1", live: true },
      ],
      sources,
      "2026-09-01",
    );
    expect(plan.create).toEqual([{ planCourseId: "p1", sourceSyllabusId: "newer" }]);
    expect(plan.skipped).toEqual([
      { planCourseId: "p2", reason: "noSource" },
      { planCourseId: "p3", reason: "noSource" },
      { planCourseId: "p4", reason: "existing" },
    ]);
  });
});

describe("schemas", () => {
  it("require ids and cap notes", () => {
    expect(
      uploadSyllabusSchema.safeParse({ planCourseId: "a", academicYearId: "b", fileId: "c" })
        .success,
    ).toBe(true);
    expect(
      uploadSyllabusSchema.safeParse({ planCourseId: "", academicYearId: "b", fileId: "c" })
        .success,
    ).toBe(false);
    expect(
      uploadSyllabusSchema.safeParse({
        planCourseId: "a",
        academicYearId: "b",
        fileId: "c",
        notes: "x".repeat(501),
      }).success,
    ).toBe(false);
    expect(carryForwardSchema.safeParse({ planId: "a" }).success).toBe(false);
  });
});
