import { describe, expect, it } from "vitest";
import { MIME, checkMime, contentDisposition, detectMime, sanitizeFileName } from "./mime";

const b = (...bytes: number[]) => new Uint8Array(bytes);
const ascii = (s: string) => new TextEncoder().encode(s);
const PDF = ascii("%PDF-1.7\n...");
const JPEG = b(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const zip = (entry: string) =>
  new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...ascii(`....${entry}document.xml`)]);

describe("detectMime", () => {
  it("recognises PDF, JPEG, PNG and Office Open XML by their first bytes", () => {
    expect(detectMime(PDF)).toBe(MIME.pdf);
    expect(detectMime(JPEG)).toBe(MIME.jpeg);
    expect(detectMime(PNG)).toBe(MIME.png);
    expect(detectMime(zip("word/"))).toBe(MIME.docx);
    expect(detectMime(zip("xl/"))).toBe(MIME.xlsx);
  });
  it("returns null for anything else, including a plain zip and scripts", () => {
    expect(detectMime(zip("misc/"))).toBeNull();
    expect(detectMime(ascii("<script>alert(1)</script>"))).toBeNull();
    expect(detectMime(ascii("MZ\x90\x00"))).toBeNull();
    expect(detectMime(new Uint8Array())).toBeNull();
  });
});

describe("checkMime (AC-4)", () => {
  const allowed = [MIME.pdf, MIME.png];
  it("accepts an allowed type with a matching, blank or generic declared type", () => {
    expect(checkMime(PDF, "application/pdf", allowed)).toEqual({ ok: true, mimeType: MIME.pdf });
    expect(checkMime(PDF, "", allowed)).toMatchObject({ ok: true });
    expect(checkMime(PDF, undefined, allowed)).toMatchObject({ ok: true });
    expect(checkMime(PDF, "application/octet-stream", allowed)).toMatchObject({ ok: true });
    expect(checkMime(PNG, "IMAGE/PNG; charset=binary", allowed)).toMatchObject({ ok: true });
  });
  it("rejects empty files", () => {
    expect(checkMime(new Uint8Array(), "application/pdf", allowed)).toEqual({
      ok: false,
      reason: "EMPTY",
    });
  });
  it("rejects types outside the purpose's allow-list and unknown content", () => {
    expect(checkMime(JPEG, "image/jpeg", allowed)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_TYPE",
    });
    expect(checkMime(ascii("hello"), "application/pdf", allowed)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_TYPE",
    });
  });
  it("rejects a declared type that contradicts the content", () => {
    expect(checkMime(PNG, "application/pdf", allowed)).toEqual({
      ok: false,
      reason: "TYPE_MISMATCH",
    });
  });
});

describe("sanitizeFileName (AC-6)", () => {
  it.each([
    ["../../etc/passwd", "passwd"],
    ["C:\\Users\\Ana\\cv.pdf", "cv.pdf"],
    ["a/b/c.pdf", "c.pdf"],
    ["  spaced   out .pdf ", "spaced out .pdf"],
    ['bad<>:"|?*name.pdf', "bad_______name.pdf"],
    [".hidden", "hidden"],
    ["trailing...", "trailing"],
    ["evil\u202Efdp.exe", "evilfdp.exe"],
    ["tab\tnew\nline.pdf", "tabnewline.pdf"],
    ["Diplomë e Studentit.pdf", "Diplomë e Studentit.pdf"],
    ["", "file"],
    ["....", "file"],
    ["/", "file"],
  ])("%j -> %j", (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });
  it("shortens long names but keeps the extension", () => {
    const out = sanitizeFileName(`${"x".repeat(300)}.pdf`);
    expect(out.length).toBe(120);
    expect(out.endsWith(".pdf")).toBe(true);
    expect(sanitizeFileName("y".repeat(300)).length).toBe(120);
  });
});

describe("contentDisposition", () => {
  it("is an attachment with an ASCII fallback and an RFC 5987 name", () => {
    const header = contentDisposition("Diplomë 'A'.pdf");
    expect(header).toMatch(
      /^attachment; filename="Diplom_ 'A'\.pdf"; filename\*=UTF-8''Diplom%C3%AB%20%27A%27\.pdf$/,
    );
  });
  it("never lets quotes or backslashes break out of the header", () => {
    expect(contentDisposition('a"b\\c.pdf')).toContain('filename="a_b_c.pdf"');
  });
});
