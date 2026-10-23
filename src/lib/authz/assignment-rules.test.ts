import { describe, expect, it } from "vitest";
import { checkAssignmentShape } from "./assignment-rules";

const code = (input: Parameters<typeof checkAssignmentShape>[0]) =>
  checkAssignmentShape(input)?.code ?? null;

describe("checkAssignmentShape (AC-9)", () => {
  it("accepts valid combinations", () => {
    expect(code({ role: "sysadmin", scopeType: "INSTITUTION" })).toBeNull();
    expect(code({ role: "secretary", scopeType: "FACULTY", scopeId: "f1" })).toBeNull();
    expect(code({ role: "student", scopeType: "SELF" })).toBeNull();
    expect(code({ role: "head_of_department", scopeType: "DEPARTMENT", scopeId: "d1" })).toBeNull();
  });
  it("rejects a scope type the role may not have", () => {
    expect(code({ role: "student", scopeType: "INSTITUTION" })).toBe("SCOPE_NOT_ALLOWED");
    expect(code({ role: "head_of_department", scopeType: "FACULTY", scopeId: "f1" })).toBe(
      "SCOPE_NOT_ALLOWED",
    );
  });
  it("requires a scopeId for faculty/department/program only", () => {
    expect(code({ role: "secretary", scopeType: "FACULTY" })).toBe("SCOPE_ID_REQUIRED");
    expect(code({ role: "sysadmin", scopeType: "INSTITUTION", scopeId: "x" })).toBe(
      "SCOPE_ID_FORBIDDEN",
    );
  });
  it("rejects an empty or reversed validity window", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(code({ role: "sysadmin", scopeType: "INSTITUTION", validFrom: t, validTo: t })).toBe(
      "INVALID_PERIOD",
    );
    expect(
      code({
        role: "sysadmin",
        scopeType: "INSTITUTION",
        validFrom: t,
        validTo: new Date(t.getTime() + 1),
      }),
    ).toBeNull();
    expect(code({ role: "sysadmin", scopeType: "INSTITUTION", validTo: t })).toBeNull();
  });
});
