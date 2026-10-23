import { describe, expect, it } from "vitest";
import { departmentSchema, facultySchema, updateDepartmentSchema } from "./schemas";
import {
  canDeactivateFaculty,
  canPlaceDepartment,
  cleanName,
  normalizeCode,
  validateCode,
} from "./unit-rules";

describe("codes (AC-2)", () => {
  it("trims and upper-cases", () => {
    expect(normalizeCode("  fsh-1 ")).toBe("FSH-1");
  });
  it.each(["FSH", "FSH-1", "ab", "A_B-9", "ABCDEFGHIJKL"])("accepts %j", (v) => {
    expect(validateCode(v).ok).toBe(true);
  });
  it.each(["", "A", "-AB", "_AB", "AB CD", "ABCDEFGHIJKLM", "ËB", "A.B", "A/B"])(
    "rejects %j",
    (v) => {
      expect(validateCode(v)).toEqual({ ok: false, reason: "invalidCode" });
    },
  );
  it("returns the normalized code", () => {
    expect(validateCode(" fe ")).toEqual({ ok: true, code: "FE" });
  });
});

describe("rules (AC-4, AC-6)", () => {
  it("blocks deactivating a faculty with active departments and reports the count", () => {
    expect(canDeactivateFaculty(0)).toEqual({ ok: true });
    expect(canDeactivateFaculty(3)).toEqual({
      ok: false,
      reason: "HAS_ACTIVE_DEPARTMENTS",
      count: 3,
    });
  });
  it("places departments only under active faculties", () => {
    expect(canPlaceDepartment(true)).toEqual({ ok: true });
    expect(canPlaceDepartment(false)).toEqual({ ok: false, reason: "FACULTY_INACTIVE" });
  });
  it("collapses whitespace in names", () => {
    expect(cleanName("  Fakulteti   i  Drejtësisë ")).toBe("Fakulteti i Drejtësisë");
  });
});

describe("schemas", () => {
  it("normalizes the code and turns a blank English name into null", () => {
    expect(facultySchema.parse({ code: " fe ", name: " Fakulteti ", nameEn: "  " })).toEqual({
      code: "FE",
      name: "Fakulteti",
      nameEn: null,
    });
    expect(facultySchema.parse({ code: "FE", name: "F" })).toMatchObject({ nameEn: null });
  });
  it("reports invalid codes and missing names as field issues", () => {
    const r = facultySchema.safeParse({ code: "!", name: " " });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.map((i) => [i.path[0], i.message]).sort()).toEqual([
        ["code", "invalidCode"],
        ["name", "required"],
      ]);
  });
  it("department create needs a faculty; update does not accept one", () => {
    expect(departmentSchema.safeParse({ code: "EC", name: "Ekonomi" }).success).toBe(false);
    expect(departmentSchema.parse({ code: "ec", name: "Ekonomi", facultyId: "f1" }).facultyId).toBe(
      "f1",
    );
    expect(
      Object.keys(
        updateDepartmentSchema.parse({
          code: "EC",
          name: "E",
          departmentId: "d1",
          facultyId: "ignored",
        }),
      ),
    ).not.toContain("facultyId");
  });
});
