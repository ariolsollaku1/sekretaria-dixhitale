// Pure content-type logic (no I/O). The client-declared type is never trusted: the type is
// detected from the file's first bytes and must be on the purpose's allow-list (AC-4).

export const MIME = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

const startsWith = (data: Uint8Array, signature: number[]) =>
  signature.every((b, i) => data[i] === b);

function includesAscii(data: Uint8Array, text: string): boolean {
  const needle = Array.from(text, (c) => c.charCodeAt(0));
  outer: for (let i = 0; i + needle.length <= data.length; i++) {
    for (let j = 0; j < needle.length; j++) if (data[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** The detected MIME type, or null when the bytes match none of the supported formats. */
export function detectMime(data: Uint8Array): string | null {
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d])) return MIME.pdf; // %PDF-
  if (startsWith(data, [0xff, 0xd8, 0xff])) return MIME.jpeg;
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MIME.png;
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
    // Office Open XML files are ZIP archives; the entry names in the first headers tell them apart.
    const head = data.subarray(0, 64 * 1024);
    if (includesAscii(head, "word/")) return MIME.docx;
    if (includesAscii(head, "xl/")) return MIME.xlsx;
  }
  return null;
}

export type MimeCheck =
  | { ok: true; mimeType: string }
  | { ok: false; reason: "EMPTY" | "UNSUPPORTED_TYPE" | "TYPE_MISMATCH" };

/** AC-4: empty, unknown, not allowed for the purpose, or contradicting the declared type. */
export function checkMime(
  data: Uint8Array,
  declared: string | null | undefined,
  allowed: readonly string[],
): MimeCheck {
  if (data.length === 0) return { ok: false, reason: "EMPTY" };
  const detected = detectMime(data);
  if (!detected || !allowed.includes(detected)) return { ok: false, reason: "UNSUPPORTED_TYPE" };
  const claim = (declared ?? "").split(";")[0]!.trim().toLowerCase();
  if (claim && claim !== "application/octet-stream" && claim !== detected)
    return { ok: false, reason: "TYPE_MISMATCH" };
  return { ok: true, mimeType: detected };
}

const MAX_NAME = 120;
// Controls, bidirectional overrides/isolates and zero-width marks can disguise a name's extension.
const INVISIBLE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** AC-6: a name safe for display and for a Content-Disposition header. Never used as a path. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  let name = base
    .replace(INVISIBLE, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if (name.length > MAX_NAME) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
    name = name.slice(0, MAX_NAME - ext.length) + ext;
  }
  return name || "file";
}

/** RFC 5987 header value so non-ASCII names (ë, ç) survive the download. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()]/g, escape)}`;
}
