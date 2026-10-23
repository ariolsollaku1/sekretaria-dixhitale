import "server-only";
import { env } from "@/lib/env";

// AC-4: HTML in, A4 PDF out. The transport is injectable so tests need no Gotenberg.
export class PdfUnavailableError extends Error {
  constructor(message = "PDF conversion unavailable") {
    super(message);
    this.name = "PdfUnavailableError";
  }
}

export type PdfConverter = (html: string) => Promise<Uint8Array>;

const TIMEOUT_MS = 8_000;

export function gotenbergConverter(
  baseUrl: () => string = () => env.GOTENBERG_URL,
  fetchImpl: typeof fetch = fetch,
): PdfConverter {
  return async (html) => {
    const form = new FormData();
    form.set("files", new Blob([html], { type: "text/html" }), "index.html");
    // A4, no margins forced here: the template's own @page CSS decides (preferCssPageSize)
    form.set("paperWidth", "8.27");
    form.set("paperHeight", "11.7");
    form.set("preferCssPageSize", "true");
    form.set("printBackground", "true");
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl().replace(/\/$/, "")}/forms/chromium/convert/html`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PdfUnavailableError();
    }
    if (!response.ok) throw new PdfUnavailableError(`Gotenberg answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // %PDF
    if (
      bytes.length < 5 ||
      bytes[0] !== 0x25 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x44 ||
      bytes[3] !== 0x46
    )
      throw new PdfUnavailableError("Gotenberg did not return a PDF");
    return bytes;
  };
}

let converter: PdfConverter | undefined;
export const getConverter = (): PdfConverter => (converter ??= gotenbergConverter());
export const setConverter = (c: PdfConverter | undefined): void => {
  converter = c;
};
