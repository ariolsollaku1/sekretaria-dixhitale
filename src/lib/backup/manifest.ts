// AC-4: the self-describing manifest and README of an export. Pure.
export type TableEntry = {
  table: string;
  rows: number;
  csvSha256: string;
  jsonlSha256: string;
};

export type FileEntry = {
  id: string;
  path: string | null;
  fileName: string;
  size: number;
  sha256: string;
  status: "ok" | "missing" | "corrupt";
};

export type Manifest = {
  format: "logos-export/1";
  generatedAt: string;
  appVersion: string;
  tables: TableEntry[];
  files: FileEntry[];
};

export function buildManifest(input: {
  generatedAt: Date;
  appVersion: string;
  tables: TableEntry[];
  files: FileEntry[];
}): Manifest {
  return {
    format: "logos-export/1",
    generatedAt: input.generatedAt.toISOString(),
    appVersion: input.appVersion,
    tables: input.tables,
    files: input.files,
  };
}

/** Path of a file inside the ZIP: the id keeps names unique, the name keeps it recognisable. */
export function zipFilePath(id: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "_");
  return `files/${id}-${safe}`;
}

export const README = `LOGOS Sekretari Dixhitale - full data export
=============================================

csv/<table>.csv     One file per table. UTF-8, first row = column names, comma separated,
                    fields with comma, quote or line break are in double quotes. An empty field
                    means no value. Values are the database text form (dates in ISO 8601, UTC).
jsonl/<table>.jsonl One JSON object per line with the same rows, exact values.
files/              The stored files, named <file id>-<original name>. The stored_files table
                    links each file to the record it belongs to.
manifest.json       Row counts and SHA-256 of every table file and every stored file.
                    A file with status "missing" or "corrupt" could not be included.

Cells are not altered, so a spreadsheet may interpret a value starting with = + - or @ as a
formula; open the CSV as text when importing.
Personal data: this archive contains all records of the system. Keep it encrypted and delete it
when it is no longer needed.
`;
