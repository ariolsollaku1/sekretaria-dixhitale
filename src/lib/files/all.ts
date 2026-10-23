import "server-only";
// Every module's file purposes: one registrar each, called by the upload and download routes.
import { registerDocumentPurposes } from "@/lib/documents/purposes";
import { registerFormPurposes } from "@/lib/forms/purposes";
import { registerNtfPurposes } from "@/modules/ntf";
import { registerPlatformPurposes } from "./platform-purposes";

export function registerAllPurposes(): void {
  registerPlatformPurposes();
  registerNtfPurposes();
  registerFormPurposes();
  registerDocumentPurposes();
}
