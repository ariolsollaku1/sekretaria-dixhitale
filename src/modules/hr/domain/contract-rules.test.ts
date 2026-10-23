import { describe, expect, it } from "vitest";
import { classifyContract, daysLeft, isoWeekKey, resolveHorizonDays } from "./contract-rules";

const today = "2026-10-23";
const classify = (
  contractEnd: string | null,
  over: Partial<{ active: boolean; horizonDays: number }> = {},
) => classifyContract({ active: true, contractEnd, today, horizonDays: 60, ...over });

describe("classifyContract (AC-1)", () => {
  it.each([
    [null, "OK"],
    ["2026-10-22", "ENDED"],
    ["2025-01-01", "ENDED"],
    ["2026-10-23", "ENDING_SOON"],
    ["2026-12-22", "ENDING_SOON"], // exactly 60 days
    ["2026-12-23", "OK"], // 61 days
    ["2030-01-01", "OK"],
  ])("end date %s is %s", (end, expected) => expect(classify(end)).toBe(expected));

  it("ignores staff who are no longer employed and respects the horizon", () => {
    expect(classify("2026-01-01", { active: false })).toBe("OK");
    expect(classify("2026-11-30", { horizonDays: 10 })).toBe("OK");
    expect(classify("2026-11-02", { horizonDays: 10 })).toBe("ENDING_SOON");
  });
  it("counts days across month ends and leap years", () => {
    expect(daysLeft("2028-03-01", "2028-02-28")).toBe(2);
    expect(daysLeft("2026-10-20", today)).toBe(-3);
  });
});

describe("settings and weeks", () => {
  it("falls back to 60 days for unusable settings", () => {
    expect(resolveHorizonDays(30)).toBe(30);
    for (const bad of [undefined, null, 0, -5, 2.5, "60", 99999])
      expect(resolveHorizonDays(bad)).toBe(60);
  });
  it("names ISO weeks", () => {
    expect(isoWeekKey("2026-10-23")).toBe("2026-W43");
    expect(isoWeekKey("2026-10-19")).toBe("2026-W43"); // Monday
    expect(isoWeekKey("2026-10-25")).toBe("2026-W43"); // Sunday
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01");
  });
});
