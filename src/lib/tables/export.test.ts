import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { guardFormula, toCsv, toXlsx, type ExportColumn, type ExportRow } from "./export";

const columns: ExportColumn[] = [
  { key: "name", label: "Emri", type: "text" },
  { key: "age", label: "Mosha", type: "number" },
  { key: "fee", label: "Tarifa", type: "money" },
  { key: "born", label: "Lindur", type: "date" },
  { key: "seen", label: "Parë", type: "datetime" },
  { key: "active", label: "Aktiv", type: "boolean" },
];
const rows: ExportRow[] = [
  {
    name: 'Ana, "Ani" Hoxha',
    age: 21,
    fee: 1234.5,
    born: "2004-02-29",
    seen: new Date("2026-07-15T10:30:00Z"),
    active: true,
  },
  {
    name: "Ëndrit\nPrifti",
    age: -3,
    fee: 0,
    born: new Date("2004-12-31T23:30:00Z"),
    seen: null,
    active: false,
  },
  { name: undefined, age: null, fee: undefined, born: null, seen: undefined, active: undefined },
];
const text = (bytes: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

describe("guardFormula (AC-10)", () => {
  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"])("prefixes %j", (s) => {
    expect(guardFormula(s)).toBe(`'${s}`);
  });
  it.each(["plain", "a=b", "1+1", "", "Ëndrit"])("leaves %j alone", (s) => {
    expect(guardFormula(s)).toBe(s);
  });
});

describe("toCsv (AC-7, AC-10)", () => {
  const csv = text(toCsv(columns, rows));

  it("starts with a UTF-8 BOM and uses CRLF line ends", () => {
    expect([...toCsv(columns, rows).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")[0]).toBe("﻿Emri,Mosha,Tarifa,Lindur,Parë,Aktiv");
  });
  it("quotes commas, quotes and newlines; formats dates in Europe/Tirane; keeps numbers plain", () => {
    expect(csv).toContain('"Ana, ""Ani"" Hoxha",21,1234.5,2004-02-29,2026-07-15 12:30,true');
    // 23:30 UTC on 31 Dec is already 1 Jan in Tirane
    expect(csv).toContain('"Ëndrit\nPrifti",-3,0,2005-01-01,,false');
  });
  it("writes empty cells for null/undefined", () => {
    expect(csv.trimEnd().endsWith(",,,,,")).toBe(true);
  });
  it("neutralises formulas in text but not real negative numbers", () => {
    const out = text(
      toCsv(
        [
          { key: "t", label: '=HYPERLINK("x")', type: "text" },
          { key: "n", label: "N", type: "number" },
        ],
        [
          { t: "=1+1", n: -5 },
          { t: "@x", n: 2 },
        ],
      ),
    );
    expect(out).toContain("'=HYPERLINK");
    expect(out).toContain("'=1+1,-5");
    expect(out).toContain("'@x,2");
  });
  it("gives a header-only file for zero rows", () => {
    expect(text(toCsv(columns, []))).toBe("﻿Emri,Mosha,Tarifa,Lindur,Parë,Aktiv\r\n");
  });
});

describe("toXlsx (AC-7, AC-10)", () => {
  async function load(bytes: Uint8Array) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    return wb.worksheets[0]!;
  }

  it("is a workbook Excel libraries can open, with a bold frozen header and the sheet name", async () => {
    const ws = await load(toXlsx(columns, rows, "Studentët"));
    expect(ws.name).toBe("Studentët");
    expect(ws.getRow(1).values).toEqual([
      undefined,
      "Emri",
      "Mosha",
      "Tarifa",
      "Lindur",
      "Parë",
      "Aktiv",
    ]);
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("writes real typed cells", async () => {
    const ws = await load(toXlsx(columns, rows));
    const r = ws.getRow(2);
    expect(r.getCell(1).value).toBe('Ana, "Ani" Hoxha');
    expect(r.getCell(2).value).toBe(21);
    expect(r.getCell(3).value).toBe(1234.5);
    expect(r.getCell(4).value).toEqual(new Date("2004-02-29T00:00:00Z"));
    expect(r.getCell(5).value).toEqual(new Date("2026-07-15T12:30:00Z")); // Tirane wall clock, as a UTC date
    expect(r.getCell(6).value).toBe(true);
    const r3 = ws.getRow(3);
    expect(r3.getCell(2).value).toBe(-3);
    expect(r3.getCell(4).value).toEqual(new Date("2005-01-01T00:00:00Z"));
    expect(r3.getCell(6).value).toBe(false);
    expect(ws.getRow(4).getCell(1).value).toBeNull();
  });

  it("keeps formula-looking text a string and strips characters XML cannot hold", async () => {
    const ws = await load(
      toXlsx(
        [{ key: "t", label: "T", type: "text" }],
        [{ t: "=1+1" }, { t: "x\u0001y<&>" }, { t: "+SUM(A1)" }],
      ),
    );
    expect(ws.getRow(2).getCell(1).value).toBe("=1+1"); // a string, not { formula }
    expect(ws.getRow(3).getCell(1).value).toBe("xy<&>");
    expect(ws.getRow(4).getCell(1).value).toBe("+SUM(A1)");
  });

  it("handles zero rows, many columns (AA...) and odd sheet names", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      key: `c${i}`,
      label: `C${i}`,
      type: "text" as const,
    }));
    const ws = await load(toXlsx(many, [{ c29: "last" }], "bad:name/with*chars[]"));
    expect(ws.name).toBe("bad name with chars");
    expect(ws.getRow(2).getCell(30).value).toBe("last");
    expect((await load(toXlsx(columns, []))).rowCount).toBe(1);
    expect((await load(toXlsx(columns, [], "   "))).name).toBe("Sheet1");
  });
});
