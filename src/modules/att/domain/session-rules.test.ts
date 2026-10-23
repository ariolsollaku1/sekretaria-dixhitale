import { describe, expect, it } from "vitest";
import {
  changedStudents,
  checkMarks,
  countMarks,
  defaultHours,
  isoWeekday,
  lecturerMayRecord,
  marksOk,
  resolveWindowDays,
  sessionsFromTimetable,
  todayInTirane,
  validateRange,
  validateSession,
} from "./session-rules";

const year = { startDate: "2026-09-01", endDate: "2027-08-31" };

describe("defaultHours (Q-60)", () => {
  it("rounds minutes / 45, at least 1, at most 12", () => {
    expect(defaultHours(480, 570)).toBe(2);
    expect(defaultHours(480, 525)).toBe(1);
    expect(defaultHours(480, 490)).toBe(1);
    expect(defaultHours(0, 1440)).toBe(12);
  });
});

describe("isoWeekday / todayInTirane", () => {
  it("1 = Monday … 7 = Sunday", () => {
    expect(isoWeekday("2026-09-07")).toBe(1);
    expect(isoWeekday("2026-09-13")).toBe(7);
  });
  it("uses the Tirane date, not UTC", () => {
    expect(todayInTirane(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(todayInTirane(new Date("2026-07-01T12:00:00Z"))).toBe("2026-07-01");
  });
});

describe("sessionsFromTimetable (AC-2)", () => {
  const monday = {
    id: "e1",
    assignmentId: "a",
    weekday: 1,
    startMinute: 480,
    endMinute: 570,
    validFrom: "2026-09-01",
    validTo: "2026-09-30",
  };
  it("gives one session per matching weekday inside the validity dates", () => {
    const s = sessionsFromTimetable([monday], "2026-09-01", "2026-10-15");
    expect(s.map((x) => x.date)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(s[0]).toMatchObject({ hours: 2, startMinute: 480, timetableEntryId: "e1" });
  });
  it("orders several entries by date and time", () => {
    const tue = { ...monday, id: "e2", weekday: 2, startMinute: 600, endMinute: 645 };
    const s = sessionsFromTimetable([tue, monday], "2026-09-07", "2026-09-09");
    expect(s.map((x) => [x.date, x.timetableEntryId])).toEqual([
      ["2026-09-07", "e1"],
      ["2026-09-08", "e2"],
    ]);
    expect(s[1]!.hours).toBe(1);
  });
  it("is empty when the range misses the validity", () => {
    expect(sessionsFromTimetable([monday], "2026-11-01", "2026-11-30")).toEqual([]);
  });
});

describe("validateRange", () => {
  it("accepts a range inside the year", () => {
    expect(validateRange("2026-09-01", "2026-12-20", year)).toEqual({});
  });
  it("refuses bad dates, reversed, too long and outside the year", () => {
    expect(validateRange("x", "2026-12-20", year).from).toBe("invalidDate");
    expect(validateRange("2026-10-02", "2026-10-01", year).to).toBe("endBeforeStart");
    expect(validateRange("2026-09-01", "2027-01-05", year).to).toBe("rangeTooLong");
    expect(validateRange("2026-09-01", "2026-12-30", year).to).toBe("rangeTooLong"); // 121 days
  });
  it("allows exactly 120 days", () => {
    expect(validateRange("2026-09-01", "2026-12-29", year)).toEqual({});
  });
  it("refuses outside the year", () => {
    expect(validateRange("2026-08-01", "2026-08-10", year).from).toBe("outsideYear");
    expect(validateRange("2027-08-30", "2027-09-02", year).to).toBe("outsideYear");
  });
});

describe("validateSession (AC-1, AC-3)", () => {
  const ok = { date: "2026-10-05", startMinute: 480, endMinute: 570, hours: 2 };
  it("accepts a valid session", () => expect(validateSession(ok, year)).toEqual({}));
  it("flags each field", () => {
    expect(validateSession({ ...ok, date: "2025-01-01" }, year).date).toBe("outsideYear");
    expect(validateSession({ ...ok, endMinute: 480 }, year).endMinute).toBe("endBeforeStart");
    expect(validateSession({ ...ok, startMinute: 1440 }, year).startMinute).toBe("timeRange");
    expect(validateSession({ ...ok, hours: 0 }, year).hours).toBe("hoursRange");
    expect(validateSession({ ...ok, hours: 13 }, year).hours).toBe("hoursRange");
    expect(validateSession({ ...ok, hours: 1.5 }, year).hours).toBe("hoursRange");
  });
});

describe("lecturerMayRecord (AC-6, AC-7)", () => {
  it("not before the class day", () => {
    expect(lecturerMayRecord("2026-10-10", "2026-10-09", 7)).toEqual({
      ok: false,
      reason: "FUTURE",
    });
  });
  it("on the day and through the window", () => {
    expect(lecturerMayRecord("2026-10-09", "2026-10-09", 7)).toEqual({ ok: true });
    expect(lecturerMayRecord("2026-10-02", "2026-10-09", 7)).toEqual({ ok: true });
  });
  it("closed the day after the window", () => {
    expect(lecturerMayRecord("2026-10-01", "2026-10-09", 7)).toEqual({
      ok: false,
      reason: "WINDOW_CLOSED",
    });
  });
  it("window 0 means the day itself only", () => {
    expect(lecturerMayRecord("2026-10-09", "2026-10-09", 0)).toEqual({ ok: true });
    expect(lecturerMayRecord("2026-10-08", "2026-10-09", 0)).toMatchObject({ ok: false });
  });
});

describe("resolveWindowDays", () => {
  it("takes whole numbers >= 0, else 7", () => {
    expect(resolveWindowDays(3)).toBe(3);
    expect(resolveWindowDays(0)).toBe(0);
    expect(resolveWindowDays(-1)).toBe(7);
    expect(resolveWindowDays(2.5)).toBe(7);
    expect(resolveWindowDays("5")).toBe(7);
    expect(resolveWindowDays(undefined)).toBe(7);
  });
});

describe("checkMarks / countMarks / changedStudents", () => {
  const m = (studentId: string, status: "PRESENT" | "ABSENT" | "EXCUSED" = "PRESENT") => ({
    studentId,
    status,
  });
  it("needs every roster student once and nobody else", () => {
    expect(marksOk(checkMarks(["a", "b"], [m("a"), m("b")]))).toBe(true);
    expect(checkMarks(["a", "b"], [m("a")]).missing).toEqual(["b"]);
    expect(checkMarks(["a"], [m("a"), m("z")]).unknown).toEqual(["z"]);
    expect(checkMarks(["a"], [m("a"), m("a")]).duplicate).toEqual(["a"]);
  });
  it("counts statuses", () => {
    expect(countMarks([m("a"), m("b", "ABSENT"), m("c", "EXCUSED"), m("d", "ABSENT")])).toEqual({
      present: 1,
      absent: 2,
      excused: 1,
    });
  });
  it("lists changed students by status or note", () => {
    const before = [m("a"), m("b", "ABSENT"), { ...m("c"), note: "x" }];
    const after = [m("a"), m("b", "EXCUSED"), { ...m("c"), note: "y" }, m("d")];
    expect(changedStudents(before, after)).toEqual(["b", "c", "d"]);
  });
});
