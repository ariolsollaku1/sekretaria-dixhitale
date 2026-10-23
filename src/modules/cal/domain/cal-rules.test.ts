import { describe, expect, it } from "vitest";
import { renderCalendar, fold, escapeText } from "./ics";
import { eventSchema, datesInsideYear } from "./schemas";
import {
  mondayOf,
  monthGrid,
  shiftEvents,
  weekNumber,
  weekShiftDays,
  weeksBetween,
  weekday,
} from "./week-rules";

describe("weeks (AC-6)", () => {
  it("weeks start on Monday", () => {
    expect(weekday("2026-10-05")).toBe(0); // Monday
    expect(weekday("2026-10-11")).toBe(6);
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
  });
  it("week 1 is the week containing the year start", () => {
    // 2026-09-30 is a Wednesday; its week starts Monday 2026-09-28
    expect(weekNumber("2026-09-30", "2026-09-30")).toBe(1);
    expect(weekNumber("2026-09-28", "2026-09-30")).toBe(1);
    expect(weekNumber("2026-10-04", "2026-09-30")).toBe(1);
    expect(weekNumber("2026-10-05", "2026-09-30")).toBe(2);
    expect(weekNumber("2026-09-27", "2026-09-30")).toBe(0);
  });
  it("lists the weeks an event spans", () => {
    const weeks = weeksBetween("2026-10-03", "2026-10-12", "2026-09-30");
    expect(weeks.map((w) => w.number)).toEqual([1, 2, 3]);
    expect(weeks[1]).toEqual({ number: 2, start: "2026-10-05", end: "2026-10-11" });
  });
});

describe("copy shift (AC-10)", () => {
  it("shifts by whole weeks closest to the year-start difference", () => {
    expect(weekShiftDays("2025-09-29", "2026-09-28")).toBe(364);
    expect(weekShiftDays("2025-09-30", "2026-09-30")).toBe(364); // 365 days -> 52 weeks
    expect(weekShiftDays("2025-10-01", "2025-10-01")).toBe(0);
  });
  it("skips events leaving the target year", () => {
    const target = { startDate: "2026-09-01", endDate: "2027-08-31" };
    const events = [
      { id: "a", startDate: "2025-12-24", endDate: "2025-12-26" },
      { id: "b", startDate: "2026-08-25", endDate: "2026-09-02" },
    ];
    const r = shiftEvents(events, 364, target);
    expect(r.kept.map((e) => e.id)).toEqual(["a"]);
    expect(r.kept[0]).toMatchObject({ startDate: "2026-12-23", endDate: "2026-12-25" });
    expect(r.skipped).toBe(1);
  });
});

describe("month grid", () => {
  it("covers whole Monday-first weeks", () => {
    const grid = monthGrid("2026-10");
    expect(grid[0]![0]).toBe("2026-09-28");
    expect(grid.at(-1)!.at(-1)).toBe("2026-11-01");
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });
  it("handles December", () => {
    const grid = monthGrid("2026-12");
    expect(grid[0]![0]).toBe("2026-11-30");
    expect(grid.at(-1)!.at(-1)).toBe("2027-01-03");
  });
});

describe("event schema (AC-2, AC-3)", () => {
  const base = {
    title: "Dita e Pavarësisë",
    type: "HOLIDAY",
    startDate: "2026-11-28",
    endDate: "2026-11-28",
    audience: "ALL",
  };
  it("accepts a valid event and clears unrelated audience fields", () => {
    const r = eventSchema.parse({ ...base, cycle: "FIRST", programId: "x" });
    expect(r.cycle).toBeNull();
    expect(r.programId).toBeNull();
  });
  it.each([
    [{ title: "  " }, "title"],
    [{ title: "x".repeat(201) }, "title"],
    [{ endDate: "2026-11-27" }, "endDate"],
    [{ startDate: "2026-02-31" }, "startDate"],
    [{ audience: "CYCLE" }, "cycle"],
    [{ audience: "PROGRAM" }, "programId"],
  ])("refuses %j", (patch, field) => {
    const r = eventSchema.safeParse({ ...base, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
  });
  it("checks dates against the year", () => {
    const year = { startDate: "2026-09-01", endDate: "2027-08-31" };
    expect(datesInsideYear({ startDate: "2026-09-01", endDate: "2027-08-31" }, year)).toBe(true);
    expect(datesInsideYear({ startDate: "2026-08-31", endDate: "2026-09-02" }, year)).toBe(false);
  });
});

describe("ics (AC-12)", () => {
  it("renders all-day events with an exclusive end", () => {
    const out = renderCalendar(
      [
        {
          id: "e1",
          title: "A, B; C",
          description: "line1\nline2",
          startDate: "2026-10-01",
          endDate: "2026-10-02",
        },
      ],
      "LOGOS",
      new Date("2026-10-23T10:00:00Z"),
    );
    expect(out).toContain("DTSTART;VALUE=DATE:20261001\r\n");
    expect(out).toContain("DTEND;VALUE=DATE:20261003\r\n");
    expect(out).toContain("SUMMARY:A\\, B\; C");
    expect(out).toContain("DESCRIPTION:line1\\nline2");
    expect(out).toContain("DTSTAMP:20261023T100000Z");
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("folds long lines at 75 octets", () => {
    const folded = fold("SUMMARY:" + "ë".repeat(100));
    for (const l of folded.split("\r\n"))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replaceAll("\r\n ", "")).toBe("SUMMARY:" + "ë".repeat(100));
  });
  it("escapes text", () => {
    expect(escapeText("a\\b")).toBe("a\\\\b");
  });
});
