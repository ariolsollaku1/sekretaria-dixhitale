import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_LIMITS, getFilePurpose, registerFilePurpose } from "@/lib/files/purposes";
import { MIME } from "@/lib/files/mime";
import { mayReadDocument } from "./queries";
import { FILE_PURPOSE } from "./issue.service";
import { registerSampleType } from "./types";

/** AC-7: reprints come from the stored file; nobody uploads this purpose (the engine writes it). */
export function registerDocumentPurposes(): void {
  registerSampleType();
  if (getFilePurpose(FILE_PURPOSE)) return;
  registerFilePurpose({
    id: FILE_PURPOSE,
    uploadPermission: "plt.document.manage",
    maxBytes: DEFAULT_LIMITS.maxBytes,
    mimeTypes: [MIME.pdf],
    canRead: async (user, file) => {
      if (file.entityType !== "IssuedDocument" || !file.entityId) return false;
      const doc = await db.issuedDocument.findUnique({
        where: { id: file.entityId },
        select: { type: true, subjectType: true, subjectId: true },
      });
      return !!doc && (await mayReadDocument(user, doc));
    },
  });
}
