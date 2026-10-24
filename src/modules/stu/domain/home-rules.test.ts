import { describe, expect, it } from "vitest";
import {
  classesOn,
  coursesByYear,
  formatMinutes,
  isOpen,
  today,
  totalCredits,
  upcoming,
} from "./home-rules";

describe("today", () => {
  it("uses Europe/Tirane, not UTC", () => {
    // 23:30 UTC on Monday 2026-10-26 is already Tuesday in Tirane (CET, UTC+1)
    expect(today(new Date("2026-10-26T23:30:00Z"))).toEqual({ day: "2026-10-27", weekday: 2 });
    expect(today(new Date("2026-10-25T12:00:00Z"))).toEqual({ day: "2026-10-25", weekday: 7 });
  });
});

describe("isOpen", () => {
  it("is true for ACTIVE and SUSPENDED only", () => {
    expect(isOpen("ACTIVE")).toBe(true);
    expect(isOpen("SUSPENDED")).toBe(true);
    expect(isOpen("GRADUATED")).toBe(false);
    expect(isOpen("DEREGISTERED")).toBe(false);
  });
});

describe("classesOn", () => {
  const e = (weekday: number, startMinute: number, validFrom: string, validTo: string) => ({
    weekday,
    startMinute,
    validFrom,
    validTo,
  });
  it("keeps the weekday and validity, ordered by start", () => {
    const list = [
      e(2, 600, "2026-09-01", "2026-12-31"),
      e(2, 480, "2026-09-01", "2026-12-31"),
      e(3, 480, "2026-09-01", "2026-12-31"),
      e(2, 480, "2027-01-01", "2027-02-01"),
      e(2, 480, "2026-01-01", "2026-10-26"),
    ];
    expect(classesOn(list, "2026-10-27", 2).map((x) => x.startMinute)).toEqual([480, 600]);
  });
  it("includes the boundary days", () => {
    const list = [e(1, 1, "2026-10-26", "2026-10-26")];
    expect(classesOn(list, "2026-10-26", 1)).toHaveLength(1);
  });
});

describe("upcoming", () => {
  const ev = (startDate: string, endDate: string) => ({ startDate, endDate });
  it("drops finished events, sorts by start and limits", () => {
    const list = [
      ev("2026-11-10", "2026-11-10"),
      ev("2026-10-01", "2026-10-20"),
      ev("2026-10-20", "2026-10-30"),
      ev("2026-10-27", "2026-10-27"),
    ];
    expect(upcoming(list, "2026-10-27", 2)).toEqual([
      ev("2026-10-20", "2026-10-30"),
      ev("2026-10-27", "2026-10-27"),
    ]);
  });
});

describe("coursesByYear", () => {
  const c = (yearOfStudy: number, semester: number, code: string, credits = 6) => ({
    yearOfStudy,
    semester,
    credits,
    course: { code },
  });
  it("groups the year by semester", () => {
    const groups = coursesByYear([c(1, 2, "B"), c(2, 3, "X"), c(1, 1, "Z"), c(1, 1, "A")], 1);
    expect(groups.map((g) => [g.semester, g.courses.map((x) => x.course.code)])).toEqual([
      [1, ["A", "Z"]],
      [2, ["B"]],
    ]);
    expect(totalCredits(groups.flatMap((g) => g.courses))).toBe(18);
  });
  it("is empty for a year without courses", () => {
    expect(coursesByYear([c(1, 1, "A")], 3)).toEqual([]);
  });
});

describe("formatMinutes", () => {
  it("pads", () => expect(formatMinutes(545)).toBe("09:05"));
});
