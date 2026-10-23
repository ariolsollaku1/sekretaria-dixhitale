import "server-only";
// Every module's file purposes: one registrar each, called by the upload and download routes.
import { registerNtfPurposes } from "@/modules/ntf";
import { registerPlatformPurposes } from "./platform-purposes";

export function registerAllPurposes(): void {
  registerPlatformPurposes();
  registerNtfPurposes();
}
