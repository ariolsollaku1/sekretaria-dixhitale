import { describe, expect, it } from "vitest";
import {
  findClashes,
  formatTime,
  parseTime,
  validateSlot,
  weekGrid,
  type Slot,
} from "./timetable-rules";

const slot = (over: Partial<Slot> = {}): Slot => ({
  weekday: 1,
  startMinute: 480,
  endMinute: 540,
  validFrom: "2026-09-28",
  validTo: "2027-01-15",
  room: "A1",
  groupId: "g1",
  staffId: "s1",
  label: "DEMO101 · Leksione",
  ...over,
});

describe("times", () => {
  it.each([
    ["08:30", 510],
    ["8:05", 485],
    ["00:00", 0],
    ["24:00", 1440],
  ])("parses %s", (v, n) => expect(parseTime(v)).toBe(n));
  it.each(["24:01", "12:60", "abc", "", "7", "12:5"])("rejects %s", (v) =>
    expect(parseTime(v)).toBeNull(),
  );
  it("formats", () => expect(formatTime(510)).toBe("08:30"));
});

describe("validateSlot (AC-1)", () => {
  const ok = {
    weekday: 3,
    startMinute: 480,
    endMinute: 540,
    validFrom: "2026-09-28",
    validTo: "2027-01-15",
    room: null,
  };
  it("accepts a valid slot", () => expect(validateSlot(ok)).toEqual({}));
  it.each([
    [{ weekday: 0 }, "weekday"],
    [{ weekday: 8 }, "weekday"],
    [{ startMinute: -1 }, "startMinute"],
    [{ endMinute: 480 }, "endMinute"],
    [{ endMinute: 1441 }, "endMinute"],
    [{ validFrom: "x" }, "validFrom"],
    [{ validTo: "2026-09-01" }, "validTo"],
    [{ room: "x".repeat(51) }, "room"],
  ])("refuses %j", (patch, field) =>
    expect(Object.keys(validateSlot({ ...ok, ...patch }))).toContain(field),
  );
});

describe("findClashes (AC-2)", () => {
  const other = slot({ id: "o", groupId: "g2", staffId: "s2", room: "B2" });
  it("finds group, lecturer and room clashes separately", () => {
    expect(findClashes(slot({ groupId: "g2" }), [other]).map((c) => c.kind)).toEqual(["GROUP"]);
    expect(findClashes(slot({ staffId: "s2" }), [other]).map((c) => c.kind)).toEqual(["LECTURER"]);
    expect(findClashes(slot({ room: " b2 " }), [other]).map((c) => c.kind)).toEqual(["ROOM"]);
    expect(
      findClashes(slot({ groupId: "g2", staffId: "s2", room: "B2" }), [other]).map((c) => c.kind),
    ).toEqual(["GROUP", "LECTURER", "ROOM"]);
  });
  it("lets touching times, other weekdays, disjoint dates and unnamed rooms coexist", () => {
    const same = { groupId: "g2", staffId: "s2", room: "B2" };
    expect(findClashes(slot({ ...same, startMinute: 540, endMinute: 600 }), [other])).toEqual([]);
    expect(findClashes(slot({ ...same, weekday: 2 }), [other])).toEqual([]);
    expect(
      findClashes(slot({ ...same, validFrom: "2027-01-16", validTo: "2027-02-01" }), [other]),
    ).toEqual([]);
    expect(
      findClashes(slot({ groupId: "gx", staffId: "sx", room: null }), [
        slot({ id: "o2", groupId: "gy", staffId: "sy", room: null }),
      ]),
    ).toEqual([]);
  });
  it("detects partial overlap and ignores the entry itself", () => {
    expect(
      findClashes(slot({ groupId: "g2", startMinute: 500, endMinute: 600 }), [other]).map(
        (c) => c.kind,
      ),
    ).toEqual(["GROUP"]);
    expect(findClashes(slot({ id: "o", groupId: "g2" }), [other])).toEqual([]);
  });
});

describe("weekGrid (AC-5)", () => {
  it("orders by time and filters by date", () => {
    const entries = [
      slot({ weekday: 2, startMinute: 600 }),
      slot({ weekday: 2, startMinute: 480 }),
      slot({ weekday: 3, validFrom: "2026-11-01" }),
    ];
    const grid = weekGrid(entries);
    expect(grid.get(2)!.map((e) => e.startMinute)).toEqual([480, 600]);
    expect(grid.get(1)).toEqual([]);
    expect(weekGrid(entries, "2026-10-15").get(3)).toEqual([]);
    expect(weekGrid(entries, "2026-11-01").get(3)).toHaveLength(1);
  });
});
