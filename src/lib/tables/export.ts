// AC-7/AC-10: pure CSV and XLSX builders. No I/O; the route handler only streams the bytes.
import { strToU8, zipSync } from "fflate";
import { TIME_ZONE } from "@/lib/i18n/config";
import type { ColumnType } from "./types";

export type ExportColumn = { key: string; label: string; type: ColumnType };
export type ExportValue = string | number | boolean | Date | null | undefined;
export type ExportRow = Record<string, ExportValue>;

// ---- shared helpers ---------------------------------------------------------------------------

type Wall = { y: number; m: number; d: number; hh: number; mm: number; ss: number };

/** The wall-clock fields of an instant in Europe/Tirane (what a user reads on screen). */
function tiranaWall(instant: Date): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return {
    y: n("year"),
    m: n("month"),
    d: n("day"),
    hh: n("hour"),
    mm: n("minute"),
    ss: n("second"),
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** A `date` cell is either a plain `YYYY-MM-DD` or an instant (shown as its Tirana day). */
function dayParts(value: Date | string): { y: number; m: number; d: number } {
  if (typeof value === "string") {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return { y: y!, m: m!, d: d! };
  }
  const w = tiranaWall(value);
  return { y: w.y, m: w.m, d: w.d };
}

const isDateLike = (v: ExportValue): v is Date => v instanceof Date && !Number.isNaN(v.getTime());

/** Text shown for a value in CSV. */
function csvText(value: ExportValue, type: ColumnType): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (value instanceof Date) {
    if (!isDateLike(value)) return "";
    if (type === "date") {
      const { y, m, d } = dayParts(value);
      return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
    }
    const w = tiranaWall(value);
    return `${pad(w.y, 4)}-${pad(w.m)}-${pad(w.d)} ${pad(w.hh)}:${pad(w.mm)}`;
  }
  return value;
}

/** Characters that make a spreadsheet read a cell as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

export function guardFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

// ---- CSV --------------------------------------------------------------------------------------

function csvCell(value: ExportValue, type: ColumnType): string {
  let text = csvText(value, type);
  // Only free text can carry a formula; real numbers (even negative) are written as they are.
  if (typeof value === "string") text = guardFormula(text);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** UTF-8 with BOM so Excel shows ë and ç correctly; CRLF line ends per RFC 4180. */
export function toCsv(columns: readonly ExportColumn[], rows: readonly ExportRow[]): Uint8Array {
  const lines = [
    columns.map((c) => csvCell(c.label, "text")).join(","),
    ...rows.map((row) => columns.map((c) => csvCell(row[c.key], c.type)).join(",")),
  ];
  return strToU8(`﻿${lines.join("\r\n")}\r\n`);
}

// ---- XLSX -------------------------------------------------------------------------------------

const XML_INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
const xmlEscape = (s: string) =>
  s
    .replace(XML_INVALID, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Excel serial date (1900 system) for wall-clock fields. */
function serial(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number {
  const days = Date.UTC(y, m - 1, d) / 86_400_000 + 25_569;
  return days + (hh * 3600 + mm * 60 + ss) / 86_400;
}

// cellXfs indexes in styles.xml below
const STYLE = { header: 1, date: 2, datetime: 3, money: 4 } as const;

function xlsxCell(ref: string, value: ExportValue, type: ColumnType): string {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    return "";
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  if (typeof value === "number")
    return `<c r="${ref}"${type === "money" ? ` s="${STYLE.money}"` : ""}><v>${value}</v></c>`;
  if (value instanceof Date) {
    if (!isDateLike(value)) return "";
    if (type === "date") {
      const { y, m, d } = dayParts(value);
      return `<c r="${ref}" s="${STYLE.date}"><v>${serial(y, m, d)}</v></c>`;
    }
    const w = tiranaWall(value);
    return `<c r="${ref}" s="${STYLE.datetime}"><v>${serial(w.y, w.m, w.d, w.hh, w.mm, w.ss)}</v></c>`;
  }
  if (type === "date" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const { y, m, d } = dayParts(value);
    return `<c r="${ref}" s="${STYLE.date}"><v>${serial(y, m, d)}</v></c>`;
  }
  // Strings are inline strings: a spreadsheet never evaluates them as formulas (AC-10).
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

function sheetName(name: string): string {
  const cleaned = name
    .replace(/[\\/?*[\]:]/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Sheet1";
}

export function toXlsx(
  columns: readonly ExportColumn[],
  rows: readonly ExportRow[],
  name = "Sheet1",
): Uint8Array {
  const widths = columns.map((c) => Math.min(60, Math.max(10, c.label.length + 2)));
  const body: string[] = [];

  const header = columns
    .map(
      (c, i) =>
        `<c r="${columnLetter(i)}1" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(c.label)}</t></is></c>`,
    )
    .join("");
  body.push(`<row r="1">${header}</row>`);

  rows.forEach((row, r) => {
    const cells = columns
      .map((c, i) => {
        const value = row[c.key];
        if (typeof value === "string")
          widths[i] = Math.min(60, Math.max(widths[i]!, value.length + 2));
        return xlsxCell(`${columnLetter(i)}${r + 2}`, value, c.type);
      })
      .join("");
    body.push(`<row r="${r + 2}">${cells}</row>`);
  });

  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body.join("")}</sheetData></worksheet>`;

  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}
