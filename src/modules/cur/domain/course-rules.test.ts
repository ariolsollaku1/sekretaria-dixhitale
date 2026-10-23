import { describe, expect, it } from "vitest";
import {
  parseWholeNumber,
  validateCategoryCode,
  validateCourseCode,
  validateCourseNumbers,
} from "./course-rules";
import { categorySchema, courseSchema } from "./schemas";

describe("course codes (AC-1)", () => {
  it.each([
    ["ec101", "EC101"],
    [" mat.1-a ", "MAT.1-A"],
    ["AB", "AB"],
    ["A".repeat(20), "A".repeat(20)],
  ])("accepts %j", (raw, code) => {
    expect(validateCourseCode(raw)).toEqual({ ok: true, code });
  });
  it.each(["", "A", ".AB", "-AB", "A B", "A".repeat(21), "Ë101", "A/B"])("rejects %j", (raw) => {
    expect(validateCourseCode(raw)).toEqual({ ok: false, reason: "invalidCourseCode" });
  });
  it("category codes start with a letter", () => {
    expect(validateCategoryCode(" compulsory ")).toEqual({ ok: true, code: "COMPULSORY" });
    expect(validateCategoryCode("1X")).toEqual({ ok: false, reason: "invalidCategoryCode" });
  });
});

describe("parseWholeNumber / validateCourseNumbers", () => {
  it.each([
    ["6", 6],
    ["6.0", 6],
    ["6,0", 6],
    [" 12 ", 12],
    ["0", 0],
  ])("%j -> %j", (raw, n) => expect(parseWholeNumber(raw)).toBe(n));
  it.each(["", "abc", "6.5", "6,5", "-1", "1e3", "6.0.0"])("rejects %j", (raw) =>
    expect(parseWholeNumber(raw)).toBeNull(),
  );

  it("checks the Q-28 limits", () => {
    expect(
      validateCourseNumbers({ defaultCredits: 6, hoursLecture: 30, hoursSeminar: 15, hoursLab: 0 }),
    ).toEqual({});
    expect(
      validateCourseNumbers({
        defaultCredits: 61,
        hoursLecture: 501,
        hoursSeminar: -1,
        hoursLab: 1.5,
      }),
    ).toEqual({
      defaultCredits: "creditsRange",
      hoursLecture: "hoursRange",
      hoursSeminar: "hoursRange",
      hoursLab: "hoursRange",
    });
    expect(
      validateCourseNumbers({ defaultCredits: 0, hoursLecture: 500, hoursSeminar: 0, hoursLab: 0 }),
    ).toEqual({});
  });
});

describe("schemas", () => {
  const ok = {
    code: " ec101 ",
    name: " Mikroekonomi ",
    defaultCredits: "6",
    hoursLecture: "30",
    departmentId: "d1",
  };
  it("parses form strings, normalises, defaults the hours", () => {
    expect(courseSchema.parse(ok)).toEqual({
      code: "EC101",
      name: "Mikroekonomi",
      nameEn: null,
      defaultCredits: 6,
      categoryId: null,
      hoursLecture: 30,
      hoursSeminar: 0,
      hoursLab: 0,
      departmentId: "d1",
    });
  });
  it("reports ranges, bad codes and missing names", () => {
    const r = courseSchema.safeParse({
      ...ok,
      code: "!",
      name: " ",
      defaultCredits: "61",
      hoursLab: "501",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]))).toEqual({
        code: "invalidCourseCode",
        name: "required",
        defaultCredits: "creditsRange",
        hoursLab: "hoursRange",
      });
  });
  it("categories need both names", () => {
    expect(
      categorySchema.parse({ code: "elective", nameSq: "Zgjedhore", nameEn: "Elective" }).code,
    ).toBe("ELECTIVE");
    expect(categorySchema.safeParse({ code: "X", nameSq: "", nameEn: "" }).success).toBe(false);
  });
});
