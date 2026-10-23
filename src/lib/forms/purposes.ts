import "server-only";
import { db } from "@/lib/db";
import { MIME } from "@/lib/files/mime";
import { DEFAULT_LIMITS, getFilePurpose, registerFilePurpose } from "@/lib/files/purposes";
import { currentRoles, mayHandle } from "./access";
import { FILE_PURPOSE } from "./submission.service";

/** File fields of authenticated forms: readable by the submitter and by the form's handlers. */
export function registerFormPurposes(): void {
  if (getFilePurpose(FILE_PURPOSE)) return;
  registerFilePurpose({
    id: FILE_PURPOSE,
    uploadPermission: "plt.form.submit",
    maxBytes: DEFAULT_LIMITS.maxBytes,
    mimeTypes: [...DEFAULT_LIMITS.mimeTypes, MIME.docx, MIME.xlsx],
    canRead: async (user, file) => {
      if (file.entityType !== "FormSubmission" || !file.entityId) return false;
      const submission = await db.formSubmission.findUnique({
        where: { id: file.entityId },
        select: { submitterId: true, definition: { select: { ownerRoles: true } } },
      });
      if (!submission) return false;
      if (submission.submitterId === user.id) return true;
      return mayHandle(await currentRoles(user.id), submission.definition.ownerRoles);
    },
  });
}
