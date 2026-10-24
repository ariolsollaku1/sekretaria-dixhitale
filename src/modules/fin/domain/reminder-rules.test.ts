import { describe, expect, it } from "vitest";
import {
  daysUntil,
  displayDay,
  reminderFor,
  resolveOverdueDays,
  resolveReminderDays,
} from "./reminder-rules";

const base = { today: "2026-10-26", outstandingCents: 50_000, daysBefore: 14, overdueAfter: null };

describe("reminderFor (AC-1, AC-3)", () => {
  it.each([
    ["due in 14 days is inside the window", "2026-11-09", "UPCOMING"],
    ["due in 15 days is outside", "2026-11-10", null],
    ["due today is upcoming", "2026-10-26", "UPCOMING"],
    ["due tomorrow is upcoming", "2026-10-27", "UPCOMING"],
    ["overdue is nothing while the notice is off", "2026-10-01", null],
  ])("%s", (_n, dueDate, expected) => {
    expect(reminderFor({ ...base, dueDate })).toBe(expected);
  });
  it("sends nothing when nothing is outstanding", () => {
    expect(reminderFor({ ...base, dueDate: "2026-10-30", outstandingCents: 0 })).toBeNull();
  });
  it("overdue notice needs the setting and the delay", () => {
    const on = { ...base, overdueAfter: 3 };
    expect(reminderFor({ ...on, dueDate: "2026-10-23" })).toBe("OVERDUE");
    expect(reminderFor({ ...on, dueDate: "2026-10-24" })).toBeNull(); // 2 days
    expect(reminderFor({ ...on, dueDate: "2026-10-23", outstandingCents: 0 })).toBeNull();
  });
});

describe("settings and helpers", () => {
  it("falls back to 14 days for anything that is not a whole number 1-90", () => {
    expect(resolveReminderDays(undefined)).toBe(14);
    expect(resolveReminderDays(0)).toBe(14);
    expect(resolveReminderDays(91)).toBe(14);
    expect(resolveReminderDays(2.5)).toBe(14);
    expect(resolveReminderDays("7")).toBe(14);
    expect(resolveReminderDays(7)).toBe(7);
  });
  it("overdue notice is off unless 1-365", () => {
    expect(resolveOverdueDays(undefined)).toBeNull();
    expect(resolveOverdueDays(0)).toBeNull();
    expect(resolveOverdueDays(366)).toBeNull();
    expect(resolveOverdueDays(5)).toBe(5);
  });
  it("counts days across a month end and formats the day", () => {
    expect(daysUntil("2026-11-02", "2026-10-30")).toBe(3);
    expect(daysUntil("2026-10-30", "2026-11-02")).toBe(-3);
    expect(displayDay("2026-11-05")).toBe("05.11.2026");
  });
});
