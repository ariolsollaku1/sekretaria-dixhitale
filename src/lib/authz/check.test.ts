import { beforeEach, describe, expect, it } from "vitest";
import {
  ForbiddenError,
  canOf,
  flattenPermissions,
  forbiddenResult,
  grantScopesOf,
  grantingAssignments,
  isAssignmentActive,
  needsScopeId,
  scopeContains,
} from "./check";
import { allPermissions, registerPermissions, resetRegistry } from "./registry";
import type { Actor, Assignment } from "./types";

const now = new Date("2026-06-01T12:00:00Z");
const past = new Date("2026-01-01T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");
const actor: Actor = { id: "u1", active: true };

const assign = (over: Partial<Assignment>): Assignment => ({
  role: "secretary",
  scopeType: "INSTITUTION",
  scopeId: null,
  validFrom: past,
  validTo: null,
  ...over,
});

beforeEach(() => {
  resetRegistry();
  registerPermissions("stu", {
    permissions: ["stu.student.read", "stu.student.write"],
    grants: {
      secretary: ["stu.student.read", "stu.student.write"],
      student: ["stu.student.read"],
      lecturer: ["stu.student.read"],
      head_of_department: ["stu.student.read"],
      program_coordinator: ["stu.student.read"],
    },
  });
});

describe("isAssignmentActive (AC-4)", () => {
  it.each([
    ["inside open window", past, null, true],
    ["inside closed window", past, future, true],
    ["not started yet", future, null, false],
    ["already ended", past, new Date("2026-05-31T00:00:00Z"), false],
    ["ends exactly now", past, now, false],
    ["starts exactly now", now, null, true],
  ])("%s", (_name, validFrom, validTo, expected) => {
    expect(isAssignmentActive(assign({ validFrom, validTo }), now)).toBe(expected);
  });
});

describe("can without a target (AC-4)", () => {
  it.each([
    ["role grants it", assign({}), "stu.student.write", true],
    [
      "role does not grant it",
      assign({ role: "student", scopeType: "SELF" }),
      "stu.student.write",
      false,
    ],
    ["expired assignment", assign({ validTo: past }), "stu.student.read", false],
    ["future assignment", assign({ validFrom: future }), "stu.student.read", false],
  ])("%s", (_name, a, permission, expected) => {
    expect(canOf(actor, [a], permission, now)).toBe(expected);
  });

  it("denies everything for an inactive user", () => {
    expect(canOf({ id: "u1", active: false }, [assign({})], "stu.student.read", now)).toBe(false);
  });

  it("denies with no assignments and allows when any one of several grants", () => {
    expect(canOf(actor, [], "stu.student.read", now)).toBe(false);
    const several = [assign({ role: "student", scopeType: "SELF" }), assign({ role: "secretary" })];
    expect(canOf(actor, several, "stu.student.write", now)).toBe(true);
  });

  it("throws on a permission nobody registered (programmer error)", () => {
    expect(() => canOf(actor, [assign({})], "nope.nope.nope", now)).toThrow(/Unknown permission/);
  });
});

describe("scope containment (AC-5)", () => {
  const facultyA = assign({ scopeType: "FACULTY", scopeId: "fa" });
  const target = { facultyId: "fa", departmentId: "d1", programId: "p1", ownerUserIds: ["s1"] };

  it("INSTITUTION contains everything", () => {
    expect(scopeContains(assign({}), actor, {})).toBe(true);
  });
  it("faculty-scoped secretary: allowed in faculty A, denied in B", () => {
    expect(canOf(actor, [facultyA], "stu.student.read", now, target)).toBe(true);
    expect(canOf(actor, [facultyA], "stu.student.read", now, { ...target, facultyId: "fb" })).toBe(
      false,
    );
    expect(canOf(actor, [facultyA], "stu.student.read", now, {})).toBe(false);
  });
  it("department and program scopes compare their own level", () => {
    const dep = assign({ role: "head_of_department", scopeType: "DEPARTMENT", scopeId: "d1" });
    const prog = assign({ role: "program_coordinator", scopeType: "PROGRAM", scopeId: "p1" });
    expect(scopeContains(dep, actor, target)).toBe(true);
    expect(scopeContains(dep, actor, { ...target, departmentId: "d2" })).toBe(false);
    expect(scopeContains(prog, actor, target)).toBe(true);
    expect(scopeContains(prog, actor, { ...target, programId: "p2" })).toBe(false);
  });
  it("an id scope without a scopeId never matches", () => {
    for (const scopeType of ["FACULTY", "DEPARTMENT", "PROGRAM"] as const) {
      expect(scopeContains(assign({ scopeType, scopeId: null }), actor, target)).toBe(false);
    }
  });
  it("SELF only matches targets the user owns", () => {
    const self = assign({ role: "student", scopeType: "SELF" });
    expect(scopeContains(self, { id: "s1", active: true }, target)).toBe(true);
    expect(scopeContains(self, actor, target)).toBe(false);
    expect(scopeContains(self, actor, {})).toBe(false);
  });
});

describe("grantScopesOf (AC-7)", () => {
  it("is empty without grants", () => {
    expect(grantScopesOf(actor, [], "stu.student.read", now)).toEqual({
      institution: false,
      facultyIds: [],
      departmentIds: [],
      programIds: [],
      self: false,
    });
  });
  it("merges several assignments into sets, de-duplicated", () => {
    const list = [
      assign({ scopeType: "FACULTY", scopeId: "fa" }),
      assign({ scopeType: "FACULTY", scopeId: "fa" }),
      assign({ scopeType: "FACULTY", scopeId: "fb" }),
      assign({ role: "head_of_department", scopeType: "DEPARTMENT", scopeId: "d1" }),
      assign({ role: "program_coordinator", scopeType: "PROGRAM", scopeId: "p1" }),
      assign({ role: "lecturer", scopeType: "SELF" }),
      assign({ role: "student", scopeType: "SELF", validTo: past }), // expired: ignored
      assign({ scopeType: "FACULTY", scopeId: null }), // corrupt: ignored
    ];
    expect(grantScopesOf(actor, list, "stu.student.read", now)).toEqual({
      institution: false,
      facultyIds: ["fa", "fb"],
      departmentIds: ["d1"],
      programIds: ["p1"],
      self: true,
    });
  });
  it("flags institution scope", () => {
    expect(grantScopesOf(actor, [assign({})], "stu.student.read", now).institution).toBe(true);
  });
});

describe("flattenPermissions (AC-10)", () => {
  it("lists permissions held anywhere, sorted, without assignment details", () => {
    const out = flattenPermissions(
      actor,
      [assign({ role: "student", scopeType: "SELF" })],
      allPermissions(),
      now,
    );
    expect(out).toEqual(["stu.student.read"]);
    expect(
      flattenPermissions({ id: "u", active: false }, [assign({})], allPermissions(), now),
    ).toEqual([]);
  });
});

describe("errors (AC-6)", () => {
  it("ForbiddenError carries the permission and a stable code", () => {
    const e = new ForbiddenError("stu.student.read");
    expect(e).toMatchObject({
      code: "FORBIDDEN",
      permission: "stu.student.read",
      name: "ForbiddenError",
    });
  });
  it("forbiddenResult has the action error shape", () => {
    expect(forbiddenResult()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
  it("grantingAssignments rejects unknown permissions even for inactive users", () => {
    expect(() => grantingAssignments({ id: "u", active: false }, [], "x.y.z", now)).toThrow();
  });
  it("needsScopeId is true for faculty, department, program only", () => {
    expect(
      ["INSTITUTION", "FACULTY", "DEPARTMENT", "PROGRAM", "SELF"].map((s) =>
        needsScopeId(s as never),
      ),
    ).toEqual([false, true, true, true, false]);
  });
});
