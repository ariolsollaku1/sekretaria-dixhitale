import { describe, expect, it } from "vitest";
import {
  computeCuts,
  countScholarships,
  distribute,
  feeEffect,
  validateTerms,
} from "./scholarship-rules";

describe("validateTerms (AC-1)", () => {
  it("FULL takes no value", () => {
    expect(validateTerms({ type: "FULL" })).toEqual({});
    expect(validateTerms({ type: "FULL", percent: 5000 })).toHaveProperty("type");
  });
  it("PARTIAL needs exactly one of percent or amount", () => {
    expect(validateTerms({ type: "PARTIAL" })).toHaveProperty("value");
    expect(validateTerms({ type: "PARTIAL", percent: 1000, amount: 100 })).toHaveProperty("value");
    expect(validateTerms({ type: "PARTIAL", percent: 5000 })).toEqual({});
    expect(validateTerms({ type: "PARTIAL", amount: 10000 })).toEqual({});
  });
  it("percent is above 0 and below 100", () => {
    expect(validateTerms({ type: "PARTIAL", percent: 0 })).toHaveProperty("percent");
    expect(validateTerms({ type: "PARTIAL", percent: 10000 })).toHaveProperty("percent");
    expect(validateTerms({ type: "PARTIAL", percent: 9999 })).toEqual({});
    expect(validateTerms({ type: "PARTIAL", amount: 0 })).toHaveProperty("amount");
  });
});

describe("distribute", () => {
  it("adds up exactly and never exceeds a weight", () => {
    const parts = distribute(100, [33, 33, 34]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([33, 33, 34]);
    const odd = distribute(10, [3, 3, 3, 3]);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(10);
    odd.forEach((p) => expect(p).toBeLessThanOrEqual(3));
  });
  it("handles full amount", () => {
    expect(distribute(7, [1, 2, 4])).toEqual([1, 2, 4]);
  });
});

describe("computeCuts (AC-4)", () => {
  const rows = [
    { id: "a", amountCents: 60000 },
    { id: "b", amountCents: 40000 },
  ];
  it("FULL cancels every installment", () => {
    const r = computeCuts(rows, { type: "FULL" });
    expect(r).toEqual({
      ok: true,
      cuts: [
        { installmentId: "a", cutCents: 60000, cancels: true },
        { installmentId: "b", cutCents: 40000, cancels: true },
      ],
    });
  });
  it("a percentage reduces each installment", () => {
    const r = computeCuts(rows, { type: "PARTIAL", percent: 5000 });
    expect(r).toEqual({
      ok: true,
      cuts: [
        { installmentId: "a", cutCents: 30000, cancels: false },
        { installmentId: "b", cutCents: 20000, cancels: false },
      ],
    });
  });
  it("an amount is shared in proportion and adds up exactly", () => {
    const r = computeCuts(rows, { type: "PARTIAL", amount: 33333 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.cuts.reduce((a, c) => a + c.cutCents, 0)).toBe(33333);
    expect(r.cuts.every((c) => !c.cancels)).toBe(true);
  });
  it("an amount equal to the tuition cancels everything", () => {
    const r = computeCuts(rows, { type: "PARTIAL", amount: 100000 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.cuts.every((c) => c.cancels)).toBe(true);
  });
  it("an amount above the tuition is refused", () => {
    expect(computeCuts(rows, { type: "PARTIAL", amount: 100001 })).toEqual({
      ok: false,
      code: "exceedsTuition",
    });
  });
  it("no tuition is refused", () => {
    expect(computeCuts([], { type: "FULL" })).toEqual({ ok: false, code: "noTuition" });
  });
});

describe("feeEffect and countScholarships", () => {
  it("fee before, reduction and after", () => {
    expect(feeEffect(100000, 25000)).toEqual({
      beforeCents: 100000,
      cutCents: 25000,
      afterCents: 75000,
    });
  });
  it("counts per year and program (SRC-084)", () => {
    const rows = countScholarships([
      { yearCode: "2026-2027", programCode: "B", type: "FULL", category: "EXCELLENCE" },
      { yearCode: "2026-2027", programCode: "A", type: "PARTIAL", category: "NEED" },
      { yearCode: "2026-2027", programCode: "A", type: "PARTIAL", category: "NEED" },
      { yearCode: "2025-2026", programCode: "A", type: "FULL", category: "DISABILITY" },
    ]);
    expect(rows.map((r) => `${r.yearCode}/${r.programCode}/${r.total}`)).toEqual([
      "2025-2026/A/1",
      "2026-2027/A/2",
      "2026-2027/B/1",
    ]);
    expect(rows[1]).toMatchObject({ partial: 2, full: 0 });
    expect(rows[1]!.byCategory.NEED).toBe(2);
  });
});
