import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_LIMITS, getFilePurpose, registerFilePurpose } from "@/lib/files/purposes";
import { archiveDocumentWhere } from "./archive.scope";

export const ARCHIVE_PURPOSE = "approved-document";
export const ARCHIVE_ENTITY = "ApprovedDocument";

/** AC-9: an active document to `view` holders in scope; a withdrawn one to writers only. */
export function registerArchivePurposes(): void {
  if (getFilePurpose(ARCHIVE_PURPOSE)) return;
  registerFilePurpose({
    id: ARCHIVE_PURPOSE,
    uploadPermission: "cur.archive.write",
    maxBytes: DEFAULT_LIMITS.maxBytes,
    mimeTypes: DEFAULT_LIMITS.mimeTypes,
    canRead: async (user, file) => {
      if (file.entityType !== ARCHIVE_ENTITY || !file.entityId) return false;
      const row = await db.approvedDocument.findFirst({
        where: { AND: [{ id: file.entityId }, await archiveDocumentWhere(user)] },
        select: { id: true },
      });
      return !!row;
    },
  });
}
