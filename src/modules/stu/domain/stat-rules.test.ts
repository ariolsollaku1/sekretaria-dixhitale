import { describe, expect, it } from "vitest";
import { ageBand, isDimension, pivot, type StatRecord } from "./stat-rules";

const rec = (over: Partial<StatRecord>): StatRecord => ({
  faculty: "F1",
  cycle: "FIRST",
  program: "P1",
  yearOfStudy: "1",
  gender: "FEMALE",
  residence: "Tiranë",
  ageBand: "20-24",
  status: "ACTIVE",
  registrationType: "FIRST_TIME",
  ...over,
});

describe("ageBand", () => {
  it.each([
    [18, "<20"],
    [19, "<20"],
    [20, "20-24"],
    [24, "20-24"],
    [25, "25-29"],
    [39, "30-39"],
    [40, "40+"],
    [71, "40+"],
  ])("%i is %s", (age, band) => expect(ageBand(age)).toBe(band));
});

describe("pivot (AC-1, AC-5)", () => {
  const data = [
    rec({}),
    rec({ gender: "MALE" }),
    rec({ gender: "MALE", program: "P2" }),
    rec({ program: "P2", yearOfStudy: "" }),
    rec({ residence: "" }),
  ];
  it("counts cells with row, column and grand totals", () => {
    const p = pivot(data, "program", "gender");
    expect(p.rows).toEqual(["P1", "P2"]);
    expect(p.cols).toEqual(["FEMALE", "MALE"]);
    expect(p.cell("P1", "FEMALE")).toBe(2);
    expect(p.cell("P1", "MALE")).toBe(1);
    expect(p.cell("P2", "FEMALE")).toBe(1);
    expect(p.cell("P2", "MALE")).toBe(1);
    expect(p.rowTotal("P1")).toBe(3);
    expect(p.colTotal("MALE")).toBe(2);
    expect(p.total).toBe(5);
  });
  it("orders empty values last, numbers naturally and age bands by age", () => {
    expect(pivot(data, "yearOfStudy", null).rows).toEqual(["1", ""]);
    expect(
      pivot([rec({ yearOfStudy: "10" }), rec({ yearOfStudy: "2" })], "yearOfStudy", null).rows,
    ).toEqual(["2", "10"]);
    expect(
      pivot(
        [rec({ ageBand: "40+" }), rec({ ageBand: "<20" }), rec({ ageBand: "25-29" })],
        "ageBand",
        null,
      ).rows,
    ).toEqual(["<20", "25-29", "40+"]);
  });
  it("collapses equal dimensions and a missing column dimension to a single count", () => {
    for (const col of [null, "program" as const]) {
      const p = pivot(data, "program", col);
      expect(p.cols).toEqual([]);
      expect(p.cell("P1", "")).toBe(3);
      expect(p.rowTotal("P2")).toBe(2);
    }
  });
  it("handles no data", () => {
    const p = pivot([], "program", "gender");
    expect(p.rows).toEqual([]);
    expect(p.total).toBe(0);
  });
  it("recognizes dimensions", () => {
    expect(isDimension("gender")).toBe(true);
    expect(isDimension("nationalId")).toBe(false);
  });
});
