import { describe, expect, it } from "vitest";
import { bySemester, classesOn, progressOf } from "./teaching-rules";

describe("classesOn", () => {
  const e = (
    weekday: number,
    startMinute: number,
    validFrom = "2026-09-01",
    validTo = "2027-06-30",
  ) => ({ weekday, startMinute, validFrom, validTo });
  it("keeps the weekday and validity, sorted by start", () => {
    const list = [
      e(2, 600),
      e(2, 480),
      e(3, 480),
      e(2, 540, "2026-11-01"),
      e(2, 700, "2026-09-01", "2026-09-30"),
    ];
    expect(classesOn(list, "2026-10-20", 2).map((x) => x.startMinute)).toEqual([480, 600]);
  });
});

describe("progressOf", () => {
  const s = (date: string, status: "PLANNED" | "HELD" | "CANCELLED", absent = 0) => ({
    date,
    status,
    counts: { absent },
  });
  it("counts held, pending, upcoming and absences", () => {
    const p = progressOf(
      [
        s("2026-10-01", "HELD", 2),
        s("2026-10-08", "HELD", 1),
        s("2026-10-20", "PLANNED"),
        s("2026-10-24", "PLANNED"),
        s("2026-10-27", "PLANNED"),
        s("2026-10-15", "CANCELLED", 5),
      ],
      "2026-10-24",
    );
    expect(p).toEqual({ held: 2, pending: 2, upcoming: 1, absences: 3 });
  });
  it("is zero without sessions", () => {
    expect(progressOf([], "2026-10-24")).toEqual({ held: 0, pending: 0, upcoming: 0, absences: 0 });
  });
});

describe("bySemester", () => {
  it("groups ascending and keeps order inside", () => {
    const out = bySemester([
      { semester: 2, n: "b" },
      { semester: 1, n: "a" },
      { semester: 2, n: "c" },
    ]);
    expect(out.map((g) => [g.semester, g.rows.map((r) => r.n)])).toEqual([
      [1, ["a"]],
      [2, ["b", "c"]],
    ]);
  });
});
