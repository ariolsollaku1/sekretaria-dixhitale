import { describe, expect, it } from "vitest";
import {
  bySchedule,
  findExamClashes,
  miniSessionAllows,
  sittingsOutside,
  validateSession,
  validateSitting,
  type Sitting,
} from "./exam-rules";
import { renderCalendar } from "./ics";

const year = { yearStart: "2026-09-01", yearEnd: "2027-08-31" };

describe("validateSession (AC-1)", () => {
  it("accepts dates inside the year", () => {
    expect(validateSession({ startDate: "2027-01-11", endDate: "2027-02-05", ...year })).toEqual(
      {},
    );
    expect(validateSession({ startDate: "2027-01-11", endDate: "2027-01-11", ...year })).toEqual(
      {},
    );
  });
  it("rejects bad, reversed and outside dates", () => {
    expect(validateSession({ startDate: "2027-13-01", endDate: "2027-02-05", ...year })).toEqual({
      startDate: "invalidDate",
    });
    expect(validateSession({ startDate: "2027-02-05", endDate: "2027-01-11", ...year })).toEqual({
      endDate: "endBeforeStart",
    });
    expect(validateSession({ startDate: "2026-08-31", endDate: "2027-09-01", ...year })).toEqual({
      startDate: "outsideYear",
      endDate: "outsideYear",
    });
  });
});

describe("validateSitting (AC-2, AC-3)", () => {
  const ok = {
    date: "2027-01-12",
    startMinute: 540,
    endMinute: 660,
    room: null,
    sessionStart: "2027-01-11",
    sessionEnd: "2027-02-05",
  };
  it("accepts a valid sitting, also on the session's boundary days", () => {
    expect(validateSitting(ok)).toEqual({});
    expect(validateSitting({ ...ok, date: "2027-01-11" })).toEqual({});
    expect(validateSitting({ ...ok, date: "2027-02-05" })).toEqual({});
  });
  it("rejects outside the session, bad times and long rooms", () => {
    expect(validateSitting({ ...ok, date: "2027-02-06" }).date).toBe("outsideSession");
    expect(validateSitting({ ...ok, date: "2027-01-10" }).date).toBe("outsideSession");
    expect(validateSitting({ ...ok, endMinute: 540 }).endMinute).toBe("endBeforeStart");
    expect(validateSitting({ ...ok, startMinute: 1440 }).startMinute).toBe("timeRange");
    expect(validateSitting({ ...ok, room: "x".repeat(51) }).room).toBe("tooLong");
  });
});

describe("miniSessionAllows (AC-4)", () => {
  it("only the final year of the program", () => {
    expect(miniSessionAllows(3, 3)).toBe(true);
    expect(miniSessionAllows(2, 3)).toBe(false);
    expect(miniSessionAllows(2, 2)).toBe(true); // master of two years
    expect(miniSessionAllows(1, 2)).toBe(false);
  });
});

const base: Sitting = {
  date: "2027-01-12",
  startMinute: 540,
  endMinute: 660,
  room: "A1",
  planId: "p1",
  yearOfStudy: 1,
  examinerIds: ["s1"],
  label: "X",
};
const other = (over: Partial<Sitting>): Sitting => ({
  ...base,
  id: "o",
  planId: "p2",
  room: "B2",
  examinerIds: ["s2"],
  ...over,
});

describe("findExamClashes (AC-5)", () => {
  it("none for a disjoint sitting", () => {
    expect(findExamClashes(base, [other({})])).toEqual([]);
  });
  it("same plan and year of study clash; another year or plan does not", () => {
    expect(findExamClashes(base, [other({ planId: "p1" })]).map((c) => c.kind)).toEqual(["GROUP"]);
    expect(findExamClashes(base, [other({ planId: "p1", yearOfStudy: 2 })])).toEqual([]);
  });
  it("examiner and room clash (room case-insensitive, only when given)", () => {
    expect(findExamClashes(base, [other({ examinerIds: ["s9", "s1"] })]).map((c) => c.kind)).toEqual(
      ["EXAMINER"],
    );
    expect(findExamClashes(base, [other({ room: " a1 " })]).map((c) => c.kind)).toEqual(["ROOM"]);
    expect(findExamClashes({ ...base, room: null }, [other({ room: null })])).toEqual([]);
  });
  it("reports every kind at once", () => {
    const kinds = findExamClashes(base, [
      other({ planId: "p1", room: "A1", examinerIds: ["s1"] }),
    ]).map((c) => c.kind);
    expect(kinds).toEqual(["GROUP", "EXAMINER", "ROOM"]);
  });
  it("touching times and other dates do not clash", () => {
    expect(findExamClashes(base, [other({ planId: "p1", startMinute: 660, endMinute: 720 })])).toEqual(
      [],
    );
    expect(findExamClashes(base, [other({ planId: "p1", date: "2027-01-13" })])).toEqual([]);
  });
  it("never clashes with itself", () => {
    expect(findExamClashes({ ...base, id: "o" }, [other({ planId: "p1" })])).toEqual([]);
  });
});

describe("helpers", () => {
  it("sittingsOutside lists the days that fall out of new dates", () => {
    expect(sittingsOutside(["2027-01-12", "2027-02-01"], "2027-01-11", "2027-01-31")).toEqual([
      "2027-02-01",
    ]);
  });
  it("bySchedule orders by date then start", () => {
    const list = [
      { date: "2027-01-13", startMinute: 540 },
      { date: "2027-01-12", startMinute: 600 },
      { date: "2027-01-12", startMinute: 540 },
    ].sort(bySchedule);
    expect(list.map((x) => `${x.date} ${x.startMinute}`)).toEqual([
      "2027-01-12 540",
      "2027-01-12 600",
      "2027-01-13 540",
    ]);
  });
});

describe("renderCalendar with times (AC-9)", () => {
  it("writes floating local date-times and a location for timed events", () => {
    const out = renderCalendar(
      [
        {
          id: "e1",
          title: "Provim: DEMO101",
          startDate: "2027-01-12",
          endDate: "2027-01-12",
          startMinute: 540,
          endMinute: 665,
          location: "A1",
        },
      ],
      "N",
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(out).toContain("DTSTART:20270112T090000");
    expect(out).toContain("DTEND:20270112T110500");
    expect(out).toContain("LOCATION:A1");
    expect(out).not.toContain("VALUE=DATE");
  });
});
