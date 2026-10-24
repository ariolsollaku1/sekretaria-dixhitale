import { describe, expect, it } from "vitest";
import {
  STAFF_ACCOUNT_ROLES,
  accountState,
  daysSince,
  defaultScope,
  defaultStaffRole,
  isStaffAccountRole,
  shouldHaveAccess,
  summarize,
} from "./account-rules";

describe("shouldHaveAccess (AC-5, AC-6)", () => {
  it("is true with an open enrollment or an active staff record, false otherwise", () => {
    expect(shouldHaveAccess({ openEnrollments: 1, activeStaff: false })).toBe(true);
    expect(shouldHaveAccess({ openEnrollments: 0, activeStaff: true })).toBe(true);
    expect(shouldHaveAccess({ openEnrollments: 2, activeStaff: true })).toBe(true);
    expect(shouldHaveAccess({ openEnrollments: 0, activeStaff: false })).toBe(false);
  });
});

describe("accountState (AC-9)", () => {
  it("tells none, disabled, pending and active apart", () => {
    expect(accountState(null)).toBe("none");
    expect(accountState({ active: false, lastLoginAt: new Date() })).toBe("disabled");
    expect(accountState({ active: true, lastLoginAt: null })).toBe("pending");
    expect(accountState({ active: true, lastLoginAt: new Date() })).toBe("active");
  });
});

describe("staff account roles (AC-4)", () => {
  it("offers institution or own-records roles only, never sysadmin or student", () => {
    expect(STAFF_ACCOUNT_ROLES).toContain("lecturer");
    expect(STAFF_ACCOUNT_ROLES).toContain("hr");
    expect(STAFF_ACCOUNT_ROLES).not.toContain("sysadmin");
    expect(STAFF_ACCOUNT_ROLES).not.toContain("student");
    expect(STAFF_ACCOUNT_ROLES).not.toContain("head_of_department");
    expect(STAFF_ACCOUNT_ROLES).not.toContain("program_coordinator");
    expect(isStaffAccountRole("library")).toBe(true);
    expect(isStaffAccountRole("sysadmin")).toBe(false);
    expect(isStaffAccountRole("nonsense")).toBe(false);
  });

  it("uses the first allowed scope and a lecturer for academic staff", () => {
    expect(defaultScope("lecturer")).toBe("SELF");
    expect(defaultScope("secretary")).toBe("INSTITUTION");
    expect(defaultStaffRole("ACADEMIC")).toBe("lecturer");
    expect(defaultStaffRole("ADMINISTRATIVE")).toBeNull();
  });
});

describe("summarize (AC-10)", () => {
  it("counts outcomes and skip reasons", () => {
    expect(
      summarize([
        { studentId: "1", result: "created" },
        { studentId: "2", result: "reminded" },
        { studentId: "3", result: "skipped", reason: "noEmail" },
        { studentId: "4", result: "skipped", reason: "noEmail" },
        { studentId: "5", result: "skipped", reason: "hasAccount" },
      ]),
    ).toEqual({ created: 1, reminded: 1, skipped: 3, reasons: { noEmail: 2, hasAccount: 1 } });
  });
});

describe("daysSince", () => {
  it("counts whole days and never goes negative", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(daysSince(new Date("2026-10-07T13:00:00Z"), now)).toBe(2);
    expect(daysSince(new Date("2026-10-11T00:00:00Z"), now)).toBe(0);
  });
});
