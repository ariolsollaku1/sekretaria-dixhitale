import { describe, expect, it } from "vitest";
import { normalizeDay, rowsFromTable, validatePaymentRows } from "./payment-import";
import {
  clearance,
  dayInTirane,
  planBalance,
  type InstallmentInput,
  type PaymentInput,
} from "./payment-rules";
import { recordPaymentSchema } from "./schemas";

const inst = (
  id: string,
  seq: number,
  dueDate: string,
  amountCents: number,
  early?: [number, string],
): InstallmentInput => ({
  id,
  sequence: seq,
  dueDate,
  amountCents,
  earlyCents: early?.[0] ?? null,
  earlyUntil: early?.[1] ?? null,
});
const pay = (
  id: string,
  paidOn: string,
  amountCents: number,
  installmentId: string | null = null,
  order = 0,
): PaymentInput => ({ id, paidOn, amountCents, installmentId, order });

const plan = [
  inst("a", 1, "2026-10-01", 60000, [54000, "2026-09-15"]),
  inst("b", 2, "2027-02-01", 40000),
];

describe("planBalance (AC-3, AC-4, AC-5)", () => {
  it("pays the oldest installment first and reports statuses", () => {
    const b = planBalance(plan, [pay("p1", "2026-10-05", 70000)], "2026-10-10");
    expect(b.installments.map((l) => [l.id, l.paidCents, l.outstandingCents, l.status])).toEqual([
      ["a", 60000, 0, "PAID"],
      ["b", 10000, 30000, "PARTIAL"],
    ]);
    expect(b.dueCents).toBe(100000);
    expect(b.paidCents).toBe(70000);
    expect(b.outstandingCents).toBe(30000);
    expect(b.overdueCents).toBe(0);
    expect(b.creditCents).toBe(0);
  });

  it("pays the chosen installment first, then the oldest", () => {
    const b = planBalance(plan, [pay("p1", "2026-10-05", 50000, "b")], "2026-10-10");
    const by = Object.fromEntries(b.installments.map((l) => [l.id, l.paidCents]));
    expect(by).toEqual({ a: 10000, b: 40000 });
  });

  it("marks late unpaid installments OVERDUE and counts the overdue amount", () => {
    const b = planBalance(plan, [], "2026-10-02");
    expect(b.installments.map((l) => l.status)).toEqual(["OVERDUE", "UNPAID"]);
    expect(b.overdueCents).toBe(60000);
    expect(b.outstandingCents).toBe(100000);
  });

  it("keeps an excess as a credit", () => {
    const b = planBalance(plan, [pay("p1", "2026-10-05", 110000)], "2026-10-10");
    expect(b.outstandingCents).toBe(0);
    expect(b.creditCents).toBe(10000);
  });

  it("settles by the early amount when paid on time (Q-110)", () => {
    const b = planBalance(plan, [pay("p1", "2026-09-15", 54000, "a")], "2026-10-10");
    const a = b.installments[0]!;
    expect(a).toMatchObject({ outstandingCents: 0, waivedCents: 6000, settledEarly: true });
    expect(b.dueCents).toBe(94000);
    expect(b.outstandingCents).toBe(40000);
  });

  it("requires the full amount when the early window has passed", () => {
    const b = planBalance(plan, [pay("p1", "2026-09-16", 54000, "a")], "2026-10-10");
    expect(b.installments[0]).toMatchObject({ outstandingCents: 6000, settledEarly: false });
  });

  it("honours two partial payments that together reach the early amount in time", () => {
    const b = planBalance(
      plan,
      [pay("p1", "2026-09-01", 20000, "a"), pay("p2", "2026-09-15", 34000, "a")],
      "2026-10-10",
    );
    expect(b.installments[0]).toMatchObject({ outstandingCents: 0, settledEarly: true });
  });

  it("orders payments by their date, not by when they were recorded", () => {
    const b = planBalance(
      plan,
      [pay("late", "2026-10-20", 6000, "a", 1), pay("early", "2026-09-10", 48000, "a", 2)],
      "2026-11-01",
    );
    // 48 000 early (not enough for 54 000), then 6 000 late: full amount needs 12 000 more.
    expect(b.installments[0]!.paidCents).toBe(54000);
    expect(b.installments[0]!.outstandingCents).toBe(6000);
  });

  it("ignores nothing silently: no installments means every payment is credit", () => {
    const b = planBalance([], [pay("p", "2026-10-01", 500)], "2026-10-02");
    expect(b.creditCents).toBe(500);
    expect(b.dueCents).toBe(0);
  });
});

describe("clearance (AC-6, Q-111)", () => {
  it("is cleared when everything due by the date is paid", () => {
    const c = clearance(
      [{ installments: plan, payments: [pay("p", "2026-09-10", 54000, "a")] }],
      "2026-12-31",
    );
    expect(c).toEqual({ cleared: true, owedCents: 0 });
  });
  it("is not cleared when an installment due by the date is outstanding", () => {
    const c = clearance([{ installments: plan, payments: [] }], "2027-02-01");
    expect(c).toEqual({ cleared: false, owedCents: 100000 });
  });
  it("ignores installments due after the date", () => {
    const c = clearance(
      [{ installments: plan, payments: [pay("p", "2026-10-02", 60000)] }],
      "2026-12-31",
    );
    expect(c.cleared).toBe(true);
  });
  it("adds the debts of several plans; a credit does not offset another plan", () => {
    const c = clearance(
      [
        { installments: [inst("x", 1, "2025-10-01", 1000)], payments: [] },
        {
          installments: [inst("y", 1, "2026-10-01", 1000)],
          payments: [pay("p", "2026-10-01", 5000)],
        },
      ],
      "2026-12-31",
    );
    expect(c).toEqual({ cleared: false, owedCents: 1000 });
  });
  it("is cleared without any plan", () => {
    expect(clearance([], "2026-12-31").cleared).toBe(true);
  });
});

describe("dayInTirane", () => {
  it("uses the Tirane calendar day", () => {
    expect(dayInTirane(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
  });
});

describe("recordPaymentSchema (AC-1)", () => {
  const base = { planId: "p", amount: "10.50", paidOn: "2026-10-01", method: "CASH" };
  it("parses the amount to cents", () => {
    expect(recordPaymentSchema.parse(base).amount).toBe(1050);
  });
  it("rejects bad amounts and methods", () => {
    expect(recordPaymentSchema.safeParse({ ...base, amount: "1.234" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, method: "GOLD" }).success).toBe(false);
  });
});

describe("payment import rows (AC-7, AC-8)", () => {
  const today = "2026-10-24";
  const table = (rows: string[][]) =>
    rowsFromTable([["student_number", "nim", "amount", "paid_on", "reference", "method"], ...rows]);
  const run = (rows: string[][]) => {
    const m = table(rows);
    if (!m.ok) throw new Error("mapping");
    return validatePaymentRows(m.records, today);
  };

  it("accepts both date formats and a decimal comma", () => {
    const r = run([
      ["000001", "", "100,50", "01.10.2026", "ref1", "bank"],
      ["", "N1", "20", "2026-10-02", "", ""],
    ]);
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({
      amountCents: 10050,
      paidOn: "2026-10-01",
      method: "BANK_TRANSFER",
    });
    expect(r.valid[1]).toMatchObject({ nim: "N1", studentNumber: null, method: "BANK_TRANSFER" });
  });
  it("reports every problem with its row and field", () => {
    const r = run([
      ["", "", "abc", "2026-13-40", "", "x"],
      ["000001", "", "10", "2026-12-01", "", ""],
    ]);
    expect(r.valid).toEqual([]);
    expect(r.errors.map((e) => `${e.row}:${e.field}:${e.code}`)).toEqual([
      "2:student_number:required",
      "2:amount:amount",
      "2:paid_on:invalidDate",
      "2:method:method",
      "3:paid_on:future",
    ]);
  });
  it("requires the amount and date columns", () => {
    expect(rowsFromTable([["student_number"], ["1"]])).toMatchObject({
      ok: false,
      error: "missingColumns",
    });
  });
  it("normalizes days", () => {
    expect(normalizeDay("5/3/2026")).toBe("2026-03-05");
  });
});
