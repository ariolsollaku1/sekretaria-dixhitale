import "server-only";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { MIME } from "@/lib/files/mime";
import { DEFAULT_LIMITS, getFilePurpose, registerFilePurpose } from "@/lib/files/purposes";

export const SYLLABUS_PURPOSE = "syllabus";
export const SYLLABUS_ENTITY = "Syllabus";

/** AC-9: an approved syllabus is open to `view` holders, a draft or archived one to `read` holders in scope. */
export function registerCurPurposes(): void {
  if (getFilePurpose(SYLLABUS_PURPOSE)) return;
  registerFilePurpose({
    id: SYLLABUS_PURPOSE,
    uploadPermission: "cur.syllabus.write",
    maxBytes: DEFAULT_LIMITS.maxBytes,
    mimeTypes: [MIME.pdf],
    canRead: async (user, file) => {
      if (file.entityType !== SYLLABUS_ENTITY || !file.entityId) return false;
      const row = await db.syllabus.findUnique({
        where: { id: file.entityId },
        select: { status: true, planCourse: { select: { plan: { select: { programId: true } } } } },
      });
      if (!row) return false;
      if (row.status === "APPROVED" && (await can(user, "cur.syllabus.view"))) return true;
      return can(user, "cur.syllabus.read", { kind: "program", id: row.planCourse.plan.programId });
    },
  });
}
