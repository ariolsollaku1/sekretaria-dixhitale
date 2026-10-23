import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  TEMPLATE_COLUMNS,
  TEMPLATE_CSV,
  decodeCsv,
  parseCsv,
  rowsFromTable,
  validateImportRows,
  type ImportContext,
} from "./import";

const enc = (s: string) => new TextEncoder().encode(s);

describe("decodeCsv (AC-9)", () => {
  it("decodes UTF-8 with and without BOM", () => {
    expect(decodeCsv(enc("a;ë\n"))).toEqual({ ok: true, text: "a;ë\n" });
    expect(decodeCsv(enc("﻿a,b"))).toEqual({ ok: true, text: "a,b" });
  });
  it("refuses a legacy encoding instead of guessing", () => {
    expect(decodeCsv(new Uint8Array([0x61, 0xeb, 0x62]))).toEqual({
      ok: false,
      error: "invalidEncoding",
    }); // "aëb" in Latin-1
  });
});

describe("parseCsv", () => {
  it("parses comma files with CRLF and quotes", () => {
    expect(parseCsv('code,name\r\nEC1,"Mikro, makro"\r\nEC2,"Ai ""tha"""\r\n')).toEqual([
      ["code", "name"],
      ["EC1", "Mikro, makro"],
      ["EC2", 'Ai "tha"'],
    ]);
  });
  it("detects the semicolon delimiter from the header (European Excel)", () => {
    expect(parseCsv("code;name;credits\nEC1;Ekonomi, e ndryshme;6\n")).toEqual([
      ["code", "name", "credits"],
      ["EC1", "Ekonomi, e ndryshme", "6"],
    ]);
  });
  it("keeps newlines inside quoted fields and skips blank lines", () => {
    expect(parseCsv('a,b\n\n"x\ny",z\n\n')).toEqual([
      ["a", "b"],
      ["x\ny", "z"],
    ]);
  });
  it("handles a missing final newline, lone CR and empty trailing fields", () => {
    expect(parseCsv("a,b\r1,")).toEqual([
      ["a", "b"],
      ["1", ""],
    ]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("rowsFromTable (AC-9)", () => {
  it("maps headers case/space/hyphen-insensitively and numbers rows from 2", () => {
    const r = rowsFromTable([
      ["Code", "NAME", "Name EN", "Credits", "Lecture-Hours", "Department", "ignored"],
      [" ec1 ", "Mikro", "Micro", "6", "30", "eco", "x"],
    ]);
    expect(r).toEqual({
      ok: true,
      records: [
        {
          row: 2,
          code: "ec1",
          name: "Mikro",
          name_en: "Micro",
          credits: "6",
          lecture_hours: "30",
          department: "eco",
        },
      ],
    });
  });
  it("reports missing required columns, empty files and too many rows", () => {
    expect(
      rowsFromTable([
        ["code", "name"],
        ["a", "b"],
      ]),
    ).toEqual({ ok: false, error: "missingColumns", missing: ["credits", "department"] });
    expect(rowsFromTable([])).toEqual({ ok: false, error: "empty" });
    expect(rowsFromTable([["code", "name", "credits", "department"]])).toEqual({
      ok: false,
      error: "empty",
    });
    const many = [
      ["code", "name", "credits", "department"],
      ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`C${i}`, "n", "1", "d"]),
    ];
    expect(rowsFromTable(many)).toEqual({ ok: false, error: "tooManyRows" });
  });
  it("the template has the documented columns and imports back as 'empty'", () => {
    const table = parseCsv(decodeCsv(enc(TEMPLATE_CSV)).ok ? TEMPLATE_CSV.replace(/^﻿/, "") : "");
    expect(table[0]).toEqual([...TEMPLATE_COLUMNS]);
    expect(rowsFromTable(table)).toEqual({ ok: false, error: "empty" });
  });
});

const ctx: ImportContext = {
  categories: new Map([["COMPULSORY", "cat1"]]),
  departments: new Map([
    ["ECO", "dep1"],
    ["LAW", "dep2"],
  ]),
  writable: "all",
};
const rec = (over: Record<string, string>) => ({
  row: 2,
  code: "EC101",
  name: "Mikro",
  credits: "6",
  department: "ECO",
  ...over,
});

describe("validateImportRows (AC-9)", () => {
  it("accepts a good row and fills defaults", () => {
    expect(
      validateImportRows(
        [rec({ category: "compulsory", lecture_hours: "30,0", name_en: "Micro" })],
        ctx,
      ),
    ).toEqual({
      valid: [
        {
          row: 2,
          code: "EC101",
          name: "Mikro",
          nameEn: "Micro",
          defaultCredits: 6,
          categoryId: "cat1",
          hoursLecture: 30,
          hoursSeminar: 0,
          hoursLab: 0,
          departmentId: "dep1",
        },
      ],
      errors: [],
    });
  });

  it.each([
    ["bad code", { code: "!" }, "code", "invalidCourseCode"],
    ["missing name", { name: "" }, "name", "required"],
    ["fractional credits", { credits: "6.5" }, "credits", "creditsRange"],
    ["too many credits", { credits: "61" }, "credits", "creditsRange"],
    ["non-numeric credits", { credits: "six" }, "credits", "creditsRange"],
    ["bad hours", { lab_hours: "501" }, "lab_hours", "hoursRange"],
    ["unknown category", { category: "NOPE" }, "category", "unknownCategory"],
    ["unknown department", { department: "XX" }, "department", "unknownDepartment"],
    ["missing department", { department: "" }, "department", "required"],
  ])("reports: %s", (_n, over, field, code) => {
    const r = validateImportRows([rec(over)], ctx);
    expect(r.valid).toEqual([]);
    expect(r.errors).toEqual([{ row: 2, field, code }]);
  });

  it("flags duplicate codes inside the file on the later row only", () => {
    const r = validateImportRows(
      [rec({}), { ...rec({}), row: 3 }, { ...rec({ code: "ec101" }), row: 4 }],
      ctx,
    );
    expect(r.valid.map((v) => v.row)).toEqual([2]);
    expect(r.errors).toEqual([
      { row: 3, field: "code", code: "duplicateInFile" },
      { row: 4, field: "code", code: "duplicateInFile" },
    ]);
  });

  it("limits rows to the departments the user may write", () => {
    const limited: ImportContext = { ...ctx, writable: new Set(["dep1"]) };
    const r = validateImportRows(
      [rec({}), { ...rec({ code: "LW1", department: "LAW" }), row: 3 }],
      limited,
    );
    expect(r.valid.map((v) => v.code)).toEqual(["EC101"]);
    expect(r.errors).toEqual([{ row: 3, field: "department", code: "departmentNotPermitted" }]);
  });

  it("collects several errors of one row", () => {
    expect(
      validateImportRows([rec({ code: "", credits: "x", department: "XX" })], ctx).errors.map(
        (e) => e.field,
      ),
    ).toEqual(["code", "credits", "department"]);
  });
});
