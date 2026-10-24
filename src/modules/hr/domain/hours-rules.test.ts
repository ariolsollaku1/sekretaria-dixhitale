import { describe, expect, it } from "vitest";
import {
  adjustable,
  aggregateHours,
  approvalState,
  isMonth,
  mayApprove,
  monthBounds,
  monthEnded,
  monthInYear,
  monthOf,
  rollupByMonth,
  type SessionLite,
} from "./hours-rules";
import { adjustSchema } from "./hours-schemas";

const s = (over: Partial<SessionLite>): SessionLite => ({
  assignmentId: "a1",
  staffId: "t1",
  date: "2026-09-10",
  hours: 2,
  status: "HELD",
  ...over,
});

describe("months", () => {
  it("validates, cuts and bounds months", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-9")).toBe(false);
    expect(monthOf("2026-09-30")).toBe("2026-09");
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2028-02").to).toBe("2028-02-29");
  });
  it("ends a month once today is in a later month (AC-6)", () => {
    expect(monthEnded("2026-09", "2026-09-30")).toBe(false);
    expect(monthEnded("2026-09", "2026-10-01")).toBe(true);
  });
  it("tests overlap with an academic year", () => {
    expect(monthInYear("2026-09", "2026-09-15", "2027-07-15")).toBe(true);
    expect(monthInYear("2026-08", "2026-09-15", "2027-07-15")).toBe(false);
    expect(monthInYear("2027-07", "2026-09-15", "2027-07-15")).toBe(true);
    expect(monthInYear("2027-08", "2026-09-15", "2027-07-15")).toBe(false);
  });
});

describe("aggregateHours (AC-1)", () => {
  it("counts only held sessions, per month, and adds adjustments", () => {
    const lines = aggregateHours(
      [
        s({ date: "2026-09-10", hours: 2 }),
        s({ date: "2026-09-17", hours: 3 }),
        s({ date: "2026-10-01", hours: 1 }),
        s({ date: "2026-09-20", status: "CANCELLED", hours: 9 }),
        s({ date: "2026-09-21", status: "PLANNED", hours: 9 }),
        s({ date: "2026-12-01", status: "PLANNED", hours: 9 }),
      ],
      [{ staffId: "t1", assignmentId: "a1", month: "2026-09", hours: -1 }],
      "2026-10-24",
    );
    expect(lines).toEqual([
      {
        staffId: "t1",
        assignmentId: "a1",
        month: "2026-09",
        sessions: 2,
        heldHours: 5,
        adjustmentHours: -1,
        total: 4,
        pending: 1,
      },
      {
        staffId: "t1",
        assignmentId: "a1",
        month: "2026-10",
        sessions: 1,
        heldHours: 1,
        adjustmentHours: 0,
        total: 1,
        pending: 0,
      },
    ]);
    // the future planned session of December makes no line
    expect(lines.some((l) => l.month === "2026-12")).toBe(false);
  });
  it("separates lecturers and assignments, and keeps an adjustment-only month", () => {
    const lines = aggregateHours(
      [s({ staffId: "t2", assignmentId: "a2" }), s({})],
      [{ staffId: "t1", assignmentId: "a1", month: "2026-08", hours: 4 }],
      "2026-10-24",
    );
    expect(lines.map((l) => [l.month, l.staffId, l.total])).toEqual([
      ["2026-08", "t1", 4],
      ["2026-09", "t1", 2],
      ["2026-09", "t2", 2],
    ]);
  });
  it("rolls assignments up per lecturer and month", () => {
    const lines = aggregateHours(
      [s({ hours: 2 }), s({ assignmentId: "a2", date: "2026-09-11", hours: 3 })],
      [],
      "2026-10-24",
    );
    expect(rollupByMonth(lines)).toEqual([
      {
        staffId: "t1",
        month: "2026-09",
        sessions: 2,
        heldHours: 5,
        adjustmentHours: 0,
        total: 5,
        pending: 0,
      },
    ]);
  });
});

describe("approval (AC-6, AC-7, AC-10)", () => {
  const cur = { heldHours: 5, adjustmentHours: 1 };
  it("derives the state", () => {
    expect(approvalState(null, cur)).toBe("PENDING");
    expect(approvalState({ status: "APPROVED", heldHours: 5, adjustmentHours: 1 }, cur)).toBe(
      "APPROVED",
    );
    expect(approvalState({ status: "APPROVED", heldHours: 4, adjustmentHours: 1 }, cur)).toBe(
      "CHANGED",
    );
    expect(approvalState({ status: "APPROVED", heldHours: 5, adjustmentHours: 0 }, cur)).toBe(
      "CHANGED",
    );
    expect(approvalState({ status: "OPEN", heldHours: 5, adjustmentHours: 1 }, cur)).toBe("OPEN");
  });
  it("approves only ended months with hours", () => {
    expect(mayApprove("2026-10", "2026-10-24", cur)).toEqual({ ok: false, reason: "NOT_ENDED" });
    expect(mayApprove("2026-09", "2026-10-24", { heldHours: 0, adjustmentHours: 0 })).toEqual({
      ok: false,
      reason: "EMPTY",
    });
    expect(mayApprove("2026-09", "2026-10-24", cur)).toEqual({ ok: true });
    expect(mayApprove("2026-09", "2026-10-24", { heldHours: 0, adjustmentHours: -2 })).toEqual({
      ok: true,
    });
  });
  it("takes adjustments only on pending or reopened months", () => {
    expect(adjustable("PENDING")).toBe(true);
    expect(adjustable("OPEN")).toBe(true);
    expect(adjustable("APPROVED")).toBe(false);
    expect(adjustable("CHANGED")).toBe(false);
  });
});

describe("adjustSchema (AC-9)", () => {
  const ok = { staffId: "s", assignmentId: "a", month: "2026-09", hours: 2, reason: "Replaced" };
  it("accepts a valid adjustment", () => {
    expect(adjustSchema.safeParse(ok).success).toBe(true);
    expect(adjustSchema.safeParse({ ...ok, hours: -100 }).success).toBe(true);
  });
  it("refuses zero, fractions, out of range, bad month and short reasons", () => {
    for (const bad of [
      { hours: 0 },
      { hours: 1.5 },
      { hours: 101 },
      { month: "2026-9" },
      { reason: "ab" },
      { reason: "x".repeat(301) },
    ])
      expect(adjustSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
  });
});
