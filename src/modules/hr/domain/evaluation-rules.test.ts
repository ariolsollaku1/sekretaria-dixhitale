import { describe, expect, it } from "vitest";
import type { FormDefinitionJson } from "@/lib/forms/definition";
import { aggregate, isScaleField, scoreAnswers } from "./evaluation-rules";

const label = { sq: "x" };
const def = {
  title: label,
  fields: [
    { key: "a", type: "number", label, integer: true, min: 1, max: 5 },
    {
      key: "b",
      type: "radio",
      label,
      options: ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label })),
    },
    { key: "c", type: "number", label, min: 0, max: 100 },
    { key: "d", type: "select", label, options: [{ value: "yes", label }] },
    { key: "e", type: "textarea", label },
  ],
  workflow: { initial: "n", states: [{ key: "n", label, final: true }], transitions: [] },
} as unknown as FormDefinitionJson;

describe("scale detection (AC-5)", () => {
  it("accepts 1-5 integer numbers and 1-5 option lists only", () => {
    expect(def.fields.map(isScaleField)).toEqual([true, true, false, false, false]);
  });
});

describe("scoreAnswers (AC-5)", () => {
  it("averages the answered scale questions to two decimals", () => {
    expect(scoreAnswers(def, { a: 5, b: "4", c: 99, e: "text" })).toBe(4.5);
    expect(scoreAnswers(def, { a: 4, b: "4" })).toBe(4);
    expect(scoreAnswers(def, { a: 5, b: "4", c: 1 })).toBe(4.5);
  });
  it("rounds", () => {
    const three = {
      ...def,
      fields: [def.fields[0]!, def.fields[1]!, { ...def.fields[0]!, key: "f" }],
    } as FormDefinitionJson;
    expect(scoreAnswers(three, { a: 5, b: "5", f: 4 })).toBe(4.67);
  });
  it("is null when no scale question was answered", () => {
    expect(scoreAnswers(def, { c: 10, e: "hello" })).toBeNull();
    expect(scoreAnswers(def, {})).toBeNull();
  });
});

describe("aggregate (AC-10)", () => {
  const rows = [
    { departmentCode: "D1", facultyCode: "F1", submitted: true, score: 4 },
    { departmentCode: "D1", facultyCode: "F1", submitted: true, score: 5 },
    { departmentCode: "D1", facultyCode: "F1", submitted: false, score: null },
    { departmentCode: "D2", facultyCode: "F1", submitted: true, score: 3 },
    { departmentCode: null, facultyCode: null, submitted: true, score: null },
  ];
  it("groups by department", () => {
    expect(aggregate(rows, "department")).toEqual([
      { key: "", total: 1, submitted: 1, scored: 0, average: null },
      { key: "D1", total: 3, submitted: 2, scored: 2, average: 4.5 },
      { key: "D2", total: 1, submitted: 1, scored: 1, average: 3 },
    ]);
  });
  it("groups by faculty and institution", () => {
    expect(aggregate(rows, "faculty").map((g) => [g.key, g.average])).toEqual([
      ["", null],
      ["F1", 4],
    ]);
    expect(aggregate(rows, "institution")).toEqual([
      { key: "", total: 5, submitted: 4, scored: 3, average: 4 },
    ]);
  });
  it("is empty without rows", () => {
    expect(aggregate([], "department")).toEqual([]);
  });
});
