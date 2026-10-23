import { describe, expect, it } from "vitest";
import {
  canMakeCurrent,
  deriveCode,
  hasErrors,
  isDay,
  isEditable,
  validateYear,
  type YearInput,
} from "./year-rules";

const good: YearInput = {
  startDate: "2026-09-01",
  endDate: "2027-08-31",
  semester1: { start: "2026-09-01", end: "2027-01-31" },
  semester2: { start: "2027-02-01", end: "2027-08-31" },
};
const errors = (over: Partial<YearInput>, others: { startDate: string; endDate: string }[] = []) =>
  validateYear({ ...good, ...over }, others);

describe("deriveCode / isDay (AC-1)", () => {
  it("derives the code from the years of the two dates", () => {
    expect(deriveCode("2026-09-01", "2027-08-31")).toBe("2026-2027");
    expect(deriveCode("2026-01-01", "2026-12-31")).toBe("2026-2026");
  });
  it.each([
    ["2026-02-28", true],
    ["2028-02-29", true],
    ["2027-02-29", false],
    ["2026-13-01", false],
    ["26-01-01", false],
    ["", false],
  ])("isDay(%j) = %s", (v, ok) => {
    expect(isDay(v)).toBe(ok);
  });
});

describe("validateYear (AC-3)", () => {
  it("accepts a well-formed year", () => {
    expect(errors({})).toEqual({});
    expect(hasErrors(errors({}))).toBe(false);
  });

  it("reports malformed dates field by field and stops there", () => {
    expect(
      errors({ startDate: "x", semester2: { start: "2027-02-30", end: "2027-08-31" } }),
    ).toEqual({ startDate: ["invalidDate"], semester2: ["invalidDate"] });
  });

  it.each([
    ["end equals start", { endDate: "2026-09-01" }, "endDate", "endBeforeStart"],
    ["end before start", { endDate: "2026-08-31" }, "endDate", "endBeforeStart"],
  ])("rejects: %s", (_n, over, field, code) => {
    expect(errors(over as Partial<YearInput>)[field as "endDate"]).toContain(code);
  });

  describe("overlap with other years (end days inclusive)", () => {
    const prev = { startDate: "2025-09-01", endDate: "2026-08-31" };
    it("allows a year that starts the day after another ends", () => {
      expect(errors({}, [prev])).toEqual({});
    });
    it("refuses a year that starts on the day another ends", () => {
      expect(
        errors({ startDate: "2026-08-31", semester1: { start: "2026-08-31", end: "2027-01-31" } }, [
          prev,
        ]).startDate,
      ).toContain("overlap");
    });
    it("refuses a year fully inside, fully around, or straddling another", () => {
      expect(errors({}, [{ startDate: "2026-10-01", endDate: "2026-12-01" }]).startDate).toContain(
        "overlap",
      );
      expect(errors({}, [{ startDate: "2026-01-01", endDate: "2027-12-31" }]).startDate).toContain(
        "overlap",
      );
      expect(errors({}, [{ startDate: "2027-08-31", endDate: "2028-08-30" }]).startDate).toContain(
        "overlap",
      );
    });
    it("is fine with years that end before / start after", () => {
      expect(
        errors({}, [
          { startDate: "2024-09-01", endDate: "2025-08-31" },
          { startDate: "2027-09-01", endDate: "2028-08-31" },
        ]),
      ).toEqual({});
    });
  });

  describe("semesters", () => {
    it("must lie inside the year", () => {
      expect(errors({ semester1: { start: "2026-08-15", end: "2027-01-31" } }).semester1).toContain(
        "semesterOutside",
      );
      expect(errors({ semester2: { start: "2027-02-01", end: "2027-09-15" } }).semester2).toContain(
        "semesterOutside",
      );
    });
    it("must have their own start before end", () => {
      expect(errors({ semester1: { start: "2027-01-31", end: "2026-09-01" } }).semester1).toContain(
        "endBeforeStart",
      );
    });
    it("must be ordered and must not overlap (semester 1 ends before semester 2 starts)", () => {
      expect(errors({ semester2: { start: "2027-01-31", end: "2027-08-31" } }).semester2).toContain(
        "semesterOrder",
      );
      expect(
        errors({
          semester1: { start: "2027-03-01", end: "2027-05-01" },
          semester2: { start: "2026-09-01", end: "2026-12-01" },
        }).semester2,
      ).toContain("semesterOrder");
    });
    it("may leave a gap between the semesters", () => {
      expect(
        errors({
          semester1: { start: "2026-09-01", end: "2026-12-20" },
          semester2: { start: "2027-02-01", end: "2027-06-30" },
        }),
      ).toEqual({});
    });
  });
});

describe("transitions (AC-6, AC-7)", () => {
  it("only a planned year can become current", () => {
    expect(canMakeCurrent("PLANNED")).toEqual({ ok: true });
    expect(canMakeCurrent("CURRENT")).toEqual({ ok: false, reason: "NOT_PLANNED" });
    expect(canMakeCurrent("CLOSED")).toEqual({ ok: false, reason: "NOT_PLANNED" });
  });
  it("closed years are not editable", () => {
    expect(isEditable("PLANNED")).toBe(true);
    expect(isEditable("CURRENT")).toBe(true);
    expect(isEditable("CLOSED")).toBe(false);
  });
});
