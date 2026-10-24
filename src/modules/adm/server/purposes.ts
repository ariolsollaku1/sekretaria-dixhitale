import "server-only";
import { can } from "@/lib/authz/guard";
import { DEFAULT_LIMITS, getFilePurpose, registerFilePurpose } from "@/lib/files/purposes";

export const FILE_PURPOSE = "application-document";

/**
 * AC-9, AC-12: documents a candidate uploaded through the private link. Staff with
 * `adm.application.read` read them through the ordinary file route; nobody can upload with this
 * purpose through /api/files (the permission is held by no role).
 */
export function registerAdmPurposes(): void {
  if (getFilePurpose(FILE_PURPOSE)) return;
  registerFilePurpose({
    id: FILE_PURPOSE,
    uploadPermission: "adm.application.upload",
    maxBytes: DEFAULT_LIMITS.maxBytes,
    mimeTypes: DEFAULT_LIMITS.mimeTypes,
    canRead: (user, file) =>
      file.entityType === "Application" && !!file.entityId
        ? can(user, "adm.application.read")
        : Promise.resolve(false),
  });
}
