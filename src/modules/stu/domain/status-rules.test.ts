import { describe, expect, it } from "vitest";
import { changeStatusSchema, transferSchema } from "./schemas";
import {
  allowedTransitions,
  canTransfer,
  canTransition,
  endsEnrollment,
  validateChange,
} from "./status-rules";

describe("transitions (AC-1)", () => {
  it("allows exactly the documented changes", () => {
    expect(allowedTransitions("ACTIVE")).toEqual(["SUSPENDED", "DEREGISTERED", "GRADUATED"]);
    expect(allowedTransitions("SUSPENDED")).toEqual(["ACTIVE", "DEREGISTERED"]);
    expect(allowedTransitions("DEREGISTERED")).toEqual([]);
    expect(allowedTransitions("GRADUATED")).toEqual([]);
    expect(canTransition("SUSPENDED", "GRADUATED")).toBe(false);
    expect(canTransition("ACTIVE", "ACTIVE")).toBe(false);
  });
  it("lets only open enrollments transfer, and only closing statuses end it", () => {
    expect(canTransfer("ACTIVE")).toBe(true);
    expect(canTransfer("SUSPENDED")).toBe(true);
    expect(canTransfer("GRADUATED")).toBe(false);
    expect(endsEnrollment("DEREGISTERED")).toBe(true);
    expect(endsEnrollment("GRADUATED")).toBe(true);
    expect(endsEnrollment("SUSPENDED")).toBe(false);
    expect(endsEnrollment("ACTIVE")).toBe(false);
  });
});

describe("validateChange (AC-3)", () => {
  const base = {
    from: "ACTIVE" as const,
    to: "SUSPENDED" as const,
    effectiveDate: "2026-11-01",
    startedAt: "2026-09-15",
    lastEventDate: "2026-09-15",
    today: "2026-11-02",
  };
  it("accepts a valid change, including today and the previous change's day", () => {
    expect(validateChange(base)).toEqual({});
    expect(validateChange({ ...base, effectiveDate: "2026-11-02" })).toEqual({});
    expect(validateChange({ ...base, effectiveDate: "2026-09-15" })).toEqual({});
  });
  it.each([
    [{ to: "ACTIVE" as const }, "to"],
    [{ from: "GRADUATED" as const }, "to"],
    [{ effectiveDate: "nope" }, "effectiveDate"],
    [{ effectiveDate: "2026-02-30" }, "effectiveDate"],
    [{ effectiveDate: "2026-09-14" }, "effectiveDate"],
    [{ lastEventDate: "2026-10-20", effectiveDate: "2026-10-19" }, "effectiveDate"],
    [{ effectiveDate: "2026-11-03" }, "effectiveDate"],
  ])("refuses %j", (patch, field) => {
    expect(Object.keys(validateChange({ ...base, ...patch }))).toContain(field);
  });
});

describe("schemas", () => {
  it("normalizes the document reference", () => {
    expect(
      changeStatusSchema.parse({
        enrollmentId: "e",
        to: "SUSPENDED",
        effectiveDate: "2026-11-01",
        documentRef: "  ",
      }).documentRef,
    ).toBeNull();
    expect(
      changeStatusSchema.parse({
        enrollmentId: "e",
        to: "SUSPENDED",
        effectiveDate: "2026-11-01",
        documentRef: " V-12/2026 ",
      }).documentRef,
    ).toBe("V-12/2026");
    expect(
      changeStatusSchema.safeParse({ enrollmentId: "e", to: "LOST", effectiveDate: "2026-11-01" })
        .success,
    ).toBe(false);
    expect(
      changeStatusSchema.safeParse({ enrollmentId: "e", to: "ACTIVE", effectiveDate: "x" }).success,
    ).toBe(false);
    expect(
      transferSchema.safeParse({
        enrollmentId: "e",
        programId: "",
        cohortId: "c",
        effectiveDate: "2026-11-01",
      }).success,
    ).toBe(false);
    expect(
      changeStatusSchema.safeParse({
        enrollmentId: "e",
        to: "ACTIVE",
        effectiveDate: "2026-11-01",
        documentRef: "x".repeat(201),
      }).success,
    ).toBe(false);
  });
});
