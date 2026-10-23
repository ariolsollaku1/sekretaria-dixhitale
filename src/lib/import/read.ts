import "server-only";
import { readSheet } from "read-excel-file/node";
import { MAX_IMPORT_BYTES, decodeCsv, parseCsv, type FileError } from "./table";

export type ImportFile = { name: string; bytes: Uint8Array };
export type TableResult = { ok: true; table: string[][] } | { ok: false; error: FileError };

const asText = (v: unknown): string =>
  v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

/** `.csv` (UTF-8, `,` or `;`) or `.xlsx` (first sheet) into rows of text. */
export async function tableFromFile(file: ImportFile): Promise<TableResult> {
  if (file.bytes.length === 0) return { ok: false, error: "empty" };
  if (file.bytes.length > MAX_IMPORT_BYTES) return { ok: false, error: "tooLarge" };
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const decoded = decodeCsv(file.bytes);
    return decoded.ok ? { ok: true, table: parseCsv(decoded.text) } : decoded;
  }
  if (name.endsWith(".xlsx")) {
    try {
      const rows = await readSheet(Buffer.from(file.bytes));
      return {
        ok: true,
        table: rows.map((r) => r.map(asText)).filter((r) => r.some((c) => c.trim() !== "")),
      };
    } catch {
      return { ok: false, error: "unsupportedFile" };
    }
  }
  return { ok: false, error: "unsupportedFile" };
}
