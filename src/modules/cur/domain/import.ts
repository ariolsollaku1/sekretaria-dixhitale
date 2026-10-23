// Pure import logic for the course catalog (CUR-01 AC-9..AC-11): decode, parse, map, validate.
// No I/O. The XLSX reader lives in the server layer and hands rows of strings to `rowsFromTable`.
import { MAX_CREDITS, MAX_HOURS, parseWholeNumber, validateCourseCode } from "./course-rules";

export { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/import/table";

export const TEMPLATE_COLUMNS = [
  "code",
  "name",
  "name_en",
  "credits",
  "category",
  "lecture_hours",
  "seminar_hours",
  "lab_hours",
  "department",
] as const;
const REQUIRED = ["code", "name", "credits", "department"] as const;

export const TEMPLATE_CSV = `﻿${TEMPLATE_COLUMNS.join(",")}\r\n`;

export { decodeCsv, normalizeHeader, parseCsv, type FileError } from "@/lib/import/table";
import { MAX_IMPORT_ROWS as MAX_ROWS, normalizeHeader, type FileError } from "@/lib/import/table";

export type RawRecord = { row: number } & Partial<
  Record<(typeof TEMPLATE_COLUMNS)[number], string>
>;

/** Maps the header row to columns. Row numbers are spreadsheet rows (header = 1). */
export function rowsFromTable(
  table: string[][],
): { ok: true; records: RawRecord[] } | { ok: false; error: FileError; missing?: string[] } {
  if (table.length === 0) return { ok: false, error: "empty" };
  const headers = table[0]!.map(normalizeHeader);
  const missing = REQUIRED.filter((c) => !headers.includes(c));
  if (missing.length > 0) return { ok: false, error: "missingColumns", missing: [...missing] };
  const body = table.slice(1);
  if (body.length === 0) return { ok: false, error: "empty" };
  if (body.length > MAX_ROWS) return { ok: false, error: "tooManyRows" };
  const records = body.map((cells, i) => {
    const rec: RawRecord = { row: i + 2 };
    headers.forEach((h, idx) => {
      if ((TEMPLATE_COLUMNS as readonly string[]).includes(h))
        (rec as unknown as Record<string, string>)[h] = (cells[idx] ?? "").trim();
    });
    return rec;
  });
  return { ok: true, records };
}

export type ImportContext = {
  /** active category code -> id */
  categories: ReadonlyMap<string, string>;
  /** active department code -> id */
  departments: ReadonlyMap<string, string>;
  /** departments the importing user may write; "all" for institution-wide writers */
  writable: ReadonlySet<string> | "all";
};

export type ValidCourse = {
  row: number;
  code: string;
  name: string;
  nameEn: string | null;
  defaultCredits: number;
  categoryId: string | null;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
  departmentId: string;
};

export type RowError = { row: number; field: string; code: string };

export function validateImportRows(
  records: readonly RawRecord[],
  ctx: ImportContext,
): { valid: ValidCourse[]; errors: RowError[] } {
  const valid: ValidCourse[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  for (const r of records) {
    const before = errors.length;
    const err = (field: string, code: string) => errors.push({ row: r.row, field, code });

    const code = validateCourseCode(r.code ?? "");
    if (!code.ok) err("code", code.reason);
    else if (seen.has(code.code)) err("code", "duplicateInFile");
    else seen.set(code.code, r.row);

    if (!(r.name ?? "").trim()) err("name", "required");
    else if ((r.name ?? "").length > 200) err("name", "tooLong");

    const credits = parseWholeNumber(r.credits ?? "");
    if (credits === null || credits > MAX_CREDITS) err("credits", "creditsRange");

    const hours: Record<"lecture_hours" | "seminar_hours" | "lab_hours", number> = {
      lecture_hours: 0,
      seminar_hours: 0,
      lab_hours: 0,
    };
    for (const key of ["lecture_hours", "seminar_hours", "lab_hours"] as const) {
      const raw = r[key] ?? "";
      if (raw === "") continue;
      const n = parseWholeNumber(raw);
      if (n === null || n > MAX_HOURS) err(key, "hoursRange");
      else hours[key] = n;
    }

    let categoryId: string | null = null;
    const categoryCode = (r.category ?? "").trim().toUpperCase();
    if (categoryCode) {
      categoryId = ctx.categories.get(categoryCode) ?? null;
      if (!categoryId) err("category", "unknownCategory");
    }

    const departmentCode = (r.department ?? "").trim().toUpperCase();
    const departmentId = ctx.departments.get(departmentCode);
    if (!departmentCode) err("department", "required");
    else if (!departmentId) err("department", "unknownDepartment");
    else if (ctx.writable !== "all" && !ctx.writable.has(departmentId))
      err("department", "departmentNotPermitted");

    if (errors.length === before && code.ok && credits !== null && departmentId) {
      valid.push({
        row: r.row,
        code: code.code,
        name: (r.name ?? "").trim(),
        nameEn: (r.name_en ?? "").trim() || null,
        defaultCredits: credits,
        categoryId,
        hoursLecture: hours.lecture_hours,
        hoursSeminar: hours.seminar_hours,
        hoursLab: hours.lab_hours,
        departmentId,
      });
    }
  }
  return { valid, errors };
}
