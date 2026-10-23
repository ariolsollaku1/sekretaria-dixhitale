// Shared, pure import helpers (CUR-01, HR-01): decode and parse a CSV into rows of text.
// No I/O. The XLSX reader lives in `read.ts`.
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type FileError =
  "invalidEncoding" | "empty" | "tooManyRows" | "tooLarge" | "missingColumns" | "unsupportedFile";

/** UTF-8 only (with or without BOM). Guessing a legacy encoding would silently corrupt ë and ç. */
export function decodeCsv(
  bytes: Uint8Array,
): { ok: true; text: string } | { ok: false; error: FileError } {
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })
        .decode(bytes)
        .replace(/^﻿/, ""),
    };
  } catch {
    return { ok: false, error: "invalidEncoding" };
  }
}

/** RFC 4180 parser; the delimiter (`,` or `;`) is taken from the header line. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const outside = firstLine.replace(/"[^"]*"/g, "");
  const delimiter =
    (outside.match(/;/g)?.length ?? 0) > (outside.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export const normalizeHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** A spreadsheet row with its 1-based row number (header = row 1) and cells by column name. */
export type RawRow<C extends string> = { row: number } & Partial<Record<C, string>>;

/**
 * Maps the header row onto the known `columns` (headers are case/space-insensitive) and checks the
 * required ones and the size limit. Unknown columns are ignored.
 */
export function mapRows<C extends string>(
  table: string[][],
  columns: readonly C[],
  required: readonly C[],
): { ok: true; records: RawRow<C>[] } | { ok: false; error: FileError; missing?: string[] } {
  if (table.length === 0) return { ok: false, error: "empty" };
  const headers = table[0]!.map(normalizeHeader);
  const missing = required.filter((c) => !headers.includes(c));
  if (missing.length > 0) return { ok: false, error: "missingColumns", missing: [...missing] };
  const body = table.slice(1);
  if (body.length === 0) return { ok: false, error: "empty" };
  if (body.length > MAX_IMPORT_ROWS) return { ok: false, error: "tooManyRows" };
  const records = body.map((cells, i) => {
    const rec = { row: i + 2 } as RawRow<C>;
    headers.forEach((h, idx) => {
      if ((columns as readonly string[]).includes(h))
        (rec as unknown as Record<string, string>)[h] = (cells[idx] ?? "").trim();
    });
    return rec;
  });
  return { ok: true, records };
}
