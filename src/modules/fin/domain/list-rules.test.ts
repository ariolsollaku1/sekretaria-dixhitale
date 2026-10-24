import { describe, expect, it } from "vitest";
import { dayBefore, pageRows, sessionClearanceDate, sortRows } from "./list-rules";

describe("list rules (FIN-05)", () => {
  it("AC-3: clearance is evaluated on the day before the session starts", () => {
    expect(sessionClearanceDate("2027-01-15")).toBe("2027-01-14");
    expect(dayBefore("2027-03-01")).toBe("2027-02-28");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
  });

  it("sorts numbers numerically, text as text, ties by the tiebreak", () => {
    const rows = [
      { id: "b", n: 10 },
      { id: "a", n: 10 },
      { id: "c", n: 2 },
    ];
    const ids = (dir: "asc" | "desc") =>
      sortRows(
        rows,
        (r) => r.n,
        dir,
        (r) => r.id,
      ).map((r) => r.id);
    expect(ids("asc")).toEqual(["c", "a", "b"]);
    expect(ids("desc")).toEqual(["a", "b", "c"]);
  });

  it("pages a list", () => {
    const rows = [1, 2, 3, 4, 5];
    expect(pageRows(rows, 2, 2)).toEqual([3, 4]);
    expect(pageRows(rows, 3, 2)).toEqual([5]);
    expect(pageRows(rows, 4, 2)).toEqual([]);
  });
});
