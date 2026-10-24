import { describe, expect, it } from "vitest";
import { byProgram, distribution, gradeBand, summarize, type EntryRecord } from "./entry-rules";

describe("gradeBand", () => {
  it.each([
    [5, "lt6"],
    [5.99, "lt6"],
    [6, "6"],
    [6.99, "6"],
    [7, "7"],
    [8, "8"],
    [8.99, "8"],
    [9, "9"],
    [10, "9"],
  ])("%d is %s", (v, band) => expect(gradeBand(v)).toBe(band));
});

const data: EntryRecord[] = [
  { program: "B", average: 9.5 },
  { program: "A", average: 7 },
  { program: "A", average: 8.25 },
  { program: "A", average: null },
  { program: "C", average: null },
];

describe("summarize (AC-2, AC-5)", () => {
  it("counts with and without average and rounds the mean", () => {
    expect(summarize(data)).toEqual({
      total: 5,
      withAverage: 3,
      withoutAverage: 2,
      overall: { n: 3, mean: 8.25, min: 7, max: 9.5 },
    });
  });
  it("has no statistics for an empty list", () => {
    expect(summarize([])).toEqual({ total: 0, withAverage: 0, withoutAverage: 0, overall: null });
  });
});

describe("distribution (AC-3)", () => {
  it("lists every band with count and share", () => {
    expect(distribution(data)).toEqual([
      { band: "lt6", count: 0, share: 0 },
      { band: "6", count: 0, share: 0 },
      { band: "7", count: 1, share: 33.33 },
      { band: "8", count: 1, share: 33.33 },
      { band: "9", count: 1, share: 33.33 },
    ]);
  });
  it("is all zero without averages", () => {
    expect(distribution([]).every((b) => b.count === 0 && b.share === 0)).toBe(true);
  });
});

describe("byProgram (AC-4)", () => {
  it("orders by code and skips programs without any average", () => {
    expect(byProgram(data)).toEqual([
      { program: "A", n: 2, mean: 7.63, min: 7, max: 8.25 },
      { program: "B", n: 1, mean: 9.5, min: 9.5, max: 9.5 },
    ]);
  });
});
