import "server-only";
import QRCode from "qrcode";

/** AC-6: an inline SVG (no external request, prints sharp at any size). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
