import { describe, expect, it } from "vitest";
import { isStaffRequestForm, leaveDatesValid } from "./request-rules";

describe("leaveDatesValid (AC-6)", () => {
  it("accepts one day and ranges", () => {
    expect(leaveDatesValid("2026-11-02", "2026-11-02")).toBe(true);
    expect(leaveDatesValid("2026-11-02", "2026-11-20")).toBe(true);
  });
  it("refuses an end before the start", () => {
    expect(leaveDatesValid("2026-11-02", "2026-11-01")).toBe(false);
  });
  it("refuses missing or malformed dates", () => {
    expect(leaveDatesValid(undefined, "2026-11-01")).toBe(false);
    expect(leaveDatesValid("2026-11-01", "")).toBe(false);
    expect(leaveDatesValid("02/11/2026", "2026-11-05")).toBe(false);
  });
});

describe("isStaffRequestForm", () => {
  it("knows the four forms only", () => {
    expect(isStaffRequestForm("staff-leave")).toBe(true);
    expect(isStaffRequestForm("deregistration")).toBe(false);
  });
});
