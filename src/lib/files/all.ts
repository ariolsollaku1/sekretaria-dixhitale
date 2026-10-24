import "server-only";
// Every module's file purposes: one registrar each, called by the upload and download routes.
import { registerDocumentPurposes } from "@/lib/documents/purposes";
import { registerFormPurposes } from "@/lib/forms/purposes";
import { registerAdmPurposes } from "@/modules/adm";
import { registerCurPurposes } from "@/modules/cur";
import { registerNtfPurposes } from "@/modules/ntf";
import { registerPlatformPurposes } from "./platform-purposes";

export function registerAllPurposes(): void {
  registerPlatformPurposes();
  registerNtfPurposes();
  registerCurPurposes();
  registerAdmPurposes();
  registerFormPurposes();
  registerDocumentPurposes();
}
