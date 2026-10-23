import { describe, expect, it } from "vitest";
import { aggregateLoad } from "./load-rules";

const r = (
  staffId: string,
  planCourseId: string,
  semester: number,
  kind: "LECTURE" | "SEMINAR" | "LAB",
  plannedHours: number,
) => ({ staffId, planCourseId, semester, kind, plannedHours });

describe("aggregateLoad (AC-1, AC-3)", () => {
  const rows = [
    r("a", "c1", 1, "LECTURE", 30),
    r("a", "c1", 1, "LAB", 10),
    r("a", "c2", 2, "SEMINAR", 15),
    r("b", "c1", 1, "LECTURE", 20),
  ];
  it("sums by semester, kind and distinct courses", () => {
    const out = aggregateLoad(rows);
    expect(out.find((x) => x.staffId === "a")).toEqual({
      staffId: "a",
      courses: 2,
      sem1: 40,
      sem2: 15,
      lecture: 30,
      seminar: 15,
      lab: 10,
      total: 55,
    });
    expect(out.find((x) => x.staffId === "b")).toMatchObject({ courses: 1, total: 20 });
  });
  it("limits to one semester", () => {
    const out = aggregateLoad(rows, 2);
    expect(out).toEqual([
      { staffId: "a", courses: 1, sem1: 0, sem2: 15, lecture: 0, seminar: 15, lab: 0, total: 15 },
    ]);
  });
  it("is empty without assignments", () => expect(aggregateLoad([])).toEqual([]));
});
