import { describe, expect, it } from "vitest";
import { TEMPLATE_COLUMNS, normalizeDay, parseRows, rowsFromTable } from "./timetable-import";

const header = [...TEMPLATE_COLUMNS] as string[];
const row = (o: Record<string, string>) => header.map((c) => o[c] ?? "");
const good = {
  program: "p1",
  cohort: "2026",
  group: "Grupi 1",
  course: "demo101",
  kind: "Leksion",
  weekday: "e hënë",
  start: "8:00",
  end: "09:30",
  room: "A1",
};

describe("timetable import parsing (AC-6)", () => {
  it("maps columns and normalizes words, times and dates", () => {
    const mapped = rowsFromTable([
      header,
      row({
        ...good,
        valid_from: "01.10.2026",
        valid_to: "2027-01-15",
        lecturer_email: " A@B.test ",
      }),
    ]);
    if (!mapped.ok) throw new Error("mapping");
    const { rows, errors } = parseRows(mapped.records);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      row: 2,
      kind: "LECTURE",
      weekday: 1,
      startMinute: 480,
      endMinute: 570,
      room: "A1",
      validFrom: "2026-10-01",
      validTo: "2027-01-15",
      lecturerEmail: "a@b.test",
    });
  });
  it("reports missing columns and empty files", () => {
    expect(rowsFromTable([])).toMatchObject({ ok: false, error: "empty" });
    expect(rowsFromTable([["program"]])).toMatchObject({ ok: false, error: "missingColumns" });
  });
  it("reports row errors with spreadsheet row numbers", () => {
    const mapped = rowsFromTable([
      header,
      row(good),
      row({ ...good, kind: "exam", weekday: "9", start: "25:00" }),
      row({ ...good, end: "07:00" }),
      row({ ...good, valid_from: "x" }),
    ]);
    if (!mapped.ok) throw new Error("mapping");
    const { rows, errors } = parseRows(mapped.records);
    expect(rows.map((r) => r.row)).toEqual([2]);
    expect(errors).toEqual(
      expect.arrayContaining([
        { row: 3, field: "kind", code: "invalidKind" },
        { row: 3, field: "weekday", code: "weekdayRange" },
        { row: 3, field: "start", code: "timeRange" },
        { row: 4, field: "end", code: "endBeforeStart" },
        { row: 5, field: "valid_from", code: "invalidDate" },
      ]),
    );
  });
  it("normalizes days", () => {
    expect(normalizeDay("1/9/2026")).toBe("2026-09-01");
    expect(normalizeDay("")).toBe("");
  });
});
