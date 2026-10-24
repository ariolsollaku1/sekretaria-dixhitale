import { describe, expect, it } from "vitest";
import {
  earlyAmounts,
  planLines,
  planTotals,
  validateAdjustment,
  validateDiscount,
  validateInstallments,
  type DiscountDraft,
  type ScheduleItemInput,
} from "./fee-rules";
import { feeItemSchema } from "./schemas";
import { centsOf, formatCents, parseCents, percentOf, shares } from "./money";

describe("money (AC-12)", () => {
  it("parses decimal strings to whole cents and back", () => {
    expect(parseCents("1234.5")).toBe(123450);
    expect(parseCents("0.07")).toBe(7);
    expect(parseCents("10")).toBe(1000);
    expect(formatCents(123450)).toBe("1234.50");
    expect(formatCents(5)).toBe("0.05");
    expect(centsOf({ toString: () => "99.10" })).toBe(9910);
  });
  it("rejects anything that is not a plain amount", () => {
    for (const bad of ["", "-1", "1,5", "1.234", "abc", "1e3", "12345678901"])
      expect(parseCents(bad)).toBeNull();
  });
  it("shares a total exactly, the rest going last", () => {
    expect(shares(100, [1, 1, 1])).toEqual([33, 33, 34]);
    expect(shares(1000, [300, 700])).toEqual([300, 700]);
    expect(shares(10, [0, 0])).toEqual([0, 10]);
    expect(shares(7, []).length).toBe(0);
  });
  it("takes a percentage in hundredths without floating point", () => {
    expect(percentOf(100000, 1000)).toBe(10000); // 10% of 1000.00
    expect(percentOf(333, 1050)).toBe(35); // 10.5% of 3.33 = 0.34965 -> 0.35
  });
});

describe("validateInstallments (AC-2)", () => {
  const r0 = { dueDate: "2026-10-01", amountCents: 60000 };
  const r1 = { dueDate: "2027-02-01", amountCents: 40000 };
  const rows = [r0, r1];
  it("accepts installments adding up to the fee, and none at all", () => {
    expect(validateInstallments(100000, rows)).toEqual({});
    expect(validateInstallments(100000, [])).toEqual({});
  });
  it("refuses a wrong sum, a repeated or invalid date and a non-positive amount", () => {
    expect(validateInstallments(100001, rows).installments).toBe("sumMismatch");
    expect(validateInstallments(100000, [r0, { ...r1, dueDate: "2026-10-01" }])).toEqual({
      installments: "duplicateDate",
    });
    expect(validateInstallments(100000, [{ ...r0, dueDate: "2026-02-30" }, r1])).toEqual({
      installments: "invalidDate",
    });
    expect(validateInstallments(100000, [{ ...r0, amountCents: 0 }, r1])).toEqual({
      installments: "amountRange",
    });
  });
});

describe("validateDiscount (AC-3)", () => {
  const d: DiscountDraft = {
    label: "",
    kind: "PERCENT",
    value: 1000,
    validFrom: "2026-09-01",
    validTo: "2026-09-30",
  };
  it("accepts a percentage and an amount below the fee", () => {
    expect(validateDiscount(100000, d)).toEqual({});
    expect(validateDiscount(100000, { ...d, kind: "AMOUNT", value: 99999 })).toEqual({});
  });
  it("refuses a reversed window and out-of-range values", () => {
    expect(validateDiscount(100000, { ...d, validFrom: "2026-10-01" }).window).toBe("reversed");
    expect(validateDiscount(100000, { ...d, value: 10001 }).value).toBe("range");
    expect(validateDiscount(100000, { ...d, value: 0 }).value).toBe("range");
    expect(validateDiscount(100000, { ...d, kind: "AMOUNT", value: 100000 }).value).toBe("range");
    expect(validateDiscount(100000, { ...d, validTo: "x" }).window).toBe("invalidDate");
  });
});

describe("earlyAmounts (AC-7)", () => {
  const pct: DiscountDraft = {
    label: "early",
    kind: "PERCENT",
    value: 1000,
    validFrom: "2026-09-01",
    validTo: "2026-09-30",
  };
  it("applies a percentage to each installment", () => {
    expect(earlyAmounts([60000, 40000], [pct])).toEqual([
      { earlyCents: 54000, earlyUntil: "2026-09-30" },
      { earlyCents: 36000, earlyUntil: "2026-09-30" },
    ]);
  });
  it("shares an amount discount so the parts add up exactly", () => {
    const out = earlyAmounts([33333, 33333, 33334], [{ ...pct, kind: "AMOUNT", value: 1000 }]).map(
      (e) => e.earlyCents!,
    );
    expect([33333, 33333, 33334].reduce((a, b) => a + b, 0) - out.reduce((a, b) => a + b, 0)).toBe(
      1000,
    );
  });
  it("uses the discount with the largest total reduction, the earlier window on a tie", () => {
    const big = { ...pct, value: 2000, validTo: "2026-08-31" };
    expect(earlyAmounts([10000], [pct, big])[0]).toEqual({
      earlyCents: 8000,
      earlyUntil: "2026-08-31",
    });
    const tie = { ...pct, kind: "AMOUNT" as const, value: 1000, validTo: "2026-08-01" };
    expect(earlyAmounts([10000], [pct, tie])[0]!.earlyUntil).toBe("2026-08-01");
  });
  it("gives nothing without discounts", () => {
    expect(earlyAmounts([100, 200], [])).toEqual([
      { earlyCents: null, earlyUntil: null },
      { earlyCents: null, earlyUntil: null },
    ]);
  });
  it("never goes below zero", () => {
    expect(earlyAmounts([100], [{ ...pct, kind: "AMOUNT", value: 500 }])[0]!.earlyCents).toBe(0);
  });
});

describe("planLines (AC-6)", () => {
  const items: ScheduleItemInput[] = [
    {
      id: "b",
      kind: "ADMINISTRATIVE",
      label: "",
      amountCents: 5000,
      installments: [],
      discounts: [],
    },
    {
      id: "a",
      kind: "TUITION",
      label: "",
      amountCents: 100000,
      installments: [
        { dueDate: "2027-02-01", amountCents: 40000 },
        { dueDate: "2026-10-01", amountCents: 60000 },
      ],
      discounts: [],
    },
  ];
  it("orders by due date and falls back to one installment on the first day of the year", () => {
    const lines = planLines(items, "2026-09-15");
    expect(lines.map((l) => [l.sequence, l.kind, l.dueDate, l.amountCents])).toEqual([
      [1, "ADMINISTRATIVE", "2026-09-15", 5000],
      [2, "TUITION", "2026-10-01", 60000],
      [3, "TUITION", "2027-02-01", 40000],
    ]);
    expect(lines[1]!.scheduleItemId).toBe("a");
  });
});

describe("planTotals (AC-9)", () => {
  it("leaves cancelled installments out and counts early amounts", () => {
    expect(
      planTotals([
        { status: "ACTIVE", amountCents: 1000, earlyCents: 900 },
        { status: "ACTIVE", amountCents: 500, earlyCents: null },
        { status: "CANCELLED", amountCents: 7000, earlyCents: null },
      ]),
    ).toEqual({ count: 2, totalCents: 1500, earlyTotalCents: 1400 });
  });
});

describe("validateAdjustment (AC-8)", () => {
  it("needs a real date and a positive amount", () => {
    expect(validateAdjustment({ dueDate: "2026-10-01", amountCents: 1 })).toEqual({});
    expect(validateAdjustment({ dueDate: "2026-13-01", amountCents: 0 })).toEqual({
      dueDate: "invalidDate",
      amount: "range",
    });
  });
});

describe("feeItemSchema", () => {
  const base = {
    programId: "p",
    academicYearId: "y",
    kind: "TUITION",
    amount: "1000.00",
    installments: [{ dueDate: "2026-10-01", amount: "1000" }],
    discounts: [{ kind: "PERCENT", value: "10.5", validFrom: "2026-09-01", validTo: "2026-09-30" }],
  };
  it("turns amounts into cents and defaults the label", () => {
    const out = feeItemSchema.parse(base);
    expect(out.amount).toBe(100000);
    expect(out.label).toBe("");
    expect(out.installments[0]!.amount).toBe(100000);
    expect(out.discounts[0]!.value).toBe(1050);
  });
  it("refuses amounts with more than two decimals", () => {
    expect(feeItemSchema.safeParse({ ...base, amount: "10.001" }).success).toBe(false);
  });
});
