import { describe, expect, it } from "vitest";
import { ageOn, birthRangeForAges } from "./age";

describe("ageOn (AC-4)", () => {
  it.each([
    ["1980-10-23", "2026-10-23", 46],
    ["1980-10-24", "2026-10-23", 45],
    ["1980-10-22", "2026-10-23", 46],
    ["2000-02-29", "2026-02-28", 25],
    ["2000-02-29", "2026-03-01", 26],
  ])("%s on %s is %i", (b, t, n) => expect(ageOn(b, t)).toBe(n));
});

describe("birthRangeForAges", () => {
  const today = "2026-10-23";
  it("matches exactly the people of that age", () => {
    const r = birthRangeForAges(40, 50, today);
    // 40 today = born 1986-10-23 at the latest; 50 until the day before 51st birthday
    expect(r).toEqual({ lte: "1986-10-23", gte: "1975-10-24" });
    for (const b of ["1986-10-23", "1975-10-24"]) {
      const a = ageOn(b, today);
      expect(a >= 40 && a <= 50).toBe(true);
    }
    for (const b of ["1986-10-24", "1975-10-23"]) {
      const a = ageOn(b, today);
      expect(a >= 40 && a <= 50).toBe(false);
    }
  });
  it("supports open ends", () => {
    expect(birthRangeForAges(null, null, today)).toEqual({});
    expect(birthRangeForAges(65, null, today)).toEqual({ lte: "1961-10-23" });
    expect(birthRangeForAges(null, 30, today)).toEqual({ gte: "1995-10-24" });
  });
});
