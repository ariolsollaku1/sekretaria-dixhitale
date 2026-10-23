import { afterEach, describe, expect, it } from "vitest";
import {
  MASK,
  diffFields,
  isSensitive,
  registerSensitiveFields,
  resetSensitiveFields,
  toJson,
} from "./diff";

afterEach(resetSensitiveFields);

describe("diffFields (AC-3)", () => {
  it("stores only the fields that changed", () => {
    const d = diffFields(
      { name: "Ana", city: "Tiranë", year: 1 },
      { name: "Ana", city: "Durrës", year: 1 },
    );
    expect(d).toEqual({ before: { city: "Tiranë" }, after: { city: "Durrës" } });
  });

  it("returns null when nothing changed, including date and nested equality", () => {
    const when = new Date("2026-01-01T00:00:00Z");
    expect(
      diffFields(
        { at: when, tags: ["a"], meta: { x: 1 } },
        { at: new Date(when), tags: ["a"], meta: { x: 1 } },
      ),
    ).toBeNull();
    expect(diffFields(null, null)).toBeNull();
    expect(diffFields(undefined, undefined)).toBeNull();
  });

  it("records a field that was added or removed as null on the other side", () => {
    expect(diffFields({ a: 1 }, { a: 1, b: 2 })).toEqual({ before: { b: null }, after: { b: 2 } });
    expect(diffFields({ a: 1, b: 2 }, { a: 1 })).toEqual({ before: { b: 2 }, after: { b: null } });
  });

  it("treats create and delete as the whole entity on one side", () => {
    expect(diffFields(null, { a: 1 })).toEqual({ before: null, after: { a: 1 } });
    expect(diffFields({ a: 1 }, null)).toEqual({ before: { a: 1 }, after: null });
  });

  it("masks sensitive fields: a change is visible, the values are not", () => {
    const d = diffFields(
      { nationalId: "J00000001A", name: "Ana" },
      { nationalId: "J00000002B", name: "Ana" },
    );
    expect(d).toEqual({ before: { nationalId: MASK }, after: { nationalId: MASK } });
    expect(JSON.stringify(d)).not.toContain("J0000000");
  });

  it("masks sensitive fields on create/delete and at any depth, case-insensitively", () => {
    const created = diffFields(null, { person: { NationalId: "X1", name: "Ana" }, password: "p" });
    expect(created).toEqual({
      before: null,
      after: { person: { NationalId: MASK, name: "Ana" }, password: MASK },
    });
    expect(JSON.stringify(diffFields({ token: "t", list: [{ secret: "s" }] }, null))).not.toMatch(
      /"t"|"s"/,
    );
  });

  it("keeps null for an absent sensitive value", () => {
    expect(diffFields({ nationalId: null }, { nationalId: "A" })).toEqual({
      before: { nationalId: null },
      after: { nationalId: MASK },
    });
  });

  it("supports registering more sensitive fields", () => {
    expect(isSensitive("passportNo")).toBe(false);
    registerSensitiveFields("passportNo");
    expect(isSensitive("PASSPORTNO")).toBe(true);
    expect(diffFields({ passportNo: "a" }, { passportNo: "b" })).toEqual({
      before: { passportNo: MASK },
      after: { passportNo: MASK },
    });
  });
});

describe("toJson", () => {
  it("normalizes dates, undefined, bigint and nested values", () => {
    expect(
      toJson({
        d: new Date("2026-01-01T00:00:00Z"),
        u: undefined,
        n: null,
        big: 5n,
        arr: [undefined, 1],
      }),
    ).toEqual({
      d: "2026-01-01T00:00:00.000Z",
      n: null,
      big: "5",
      arr: [null, 1],
    });
    expect(toJson(undefined)).toBeNull();
    expect(toJson("x")).toBe("x");
  });
});
