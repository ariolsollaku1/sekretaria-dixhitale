import "server-only";
import { can } from "@/lib/authz/guard";
import { MIME } from "./mime";
import { DEFAULT_LIMITS, getFilePurpose, registerFilePurpose } from "./purposes";

/** AC-14: the reference purpose. Guarded so dev hot reloads do not register it twice. */
export function registerPlatformPurposes(): void {
  if (getFilePurpose("general")) return;
  registerFilePurpose({
    id: "general",
    uploadPermission: "plt.file.upload",
    maxBytes: DEFAULT_LIMITS.maxBytes,
    mimeTypes: [...DEFAULT_LIMITS.mimeTypes, MIME.docx, MIME.xlsx],
    canRead: (user) => can(user, "plt.file.read"),
  });
}
