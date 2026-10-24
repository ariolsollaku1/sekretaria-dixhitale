// Pure CSV encoding for the export (RFC 4180 style, UTF-8, CRLF line ends). A null value is an
// empty field; values are never altered (this is a data export, not a spreadsheet report).
export function csvField(value: string | null): string {
  if (value === null) return "";
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function csvRow(values: readonly (string | null)[]): string {
  return values.map(csvField).join(",") + "\r\n";
}
