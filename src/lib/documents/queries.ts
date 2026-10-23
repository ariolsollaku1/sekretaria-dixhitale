import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/authz/guard";
import { getDocumentType } from "./types";

/** AC-8: the only facts a stranger with the code may learn. */
export async function getVerification(code: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  const doc = await db.issuedDocument.findUnique({
    where: { verifyCode: code },
    select: { type: true, number: true, issuedAt: true, cancelledAt: true },
  });
  if (!doc) return null;
  return {
    type: doc.type,
    number: doc.number,
    issuedAt: doc.issuedAt,
    status: doc.cancelledAt ? ("cancelled" as const) : ("valid" as const),
  };
}

/** AC-7: the sysadmin, or whoever the type's own rule allows. */
export async function mayReadDocument(
  user: { id: string },
  doc: { type: string; subjectType: string | null; subjectId: string | null },
): Promise<boolean> {
  if (await can(user, "plt.document.manage")) return true;
  const def = getDocumentType(doc.type);
  return def?.canRead ? def.canRead(user, doc) : false;
}
