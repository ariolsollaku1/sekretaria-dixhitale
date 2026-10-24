import "server-only";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { getDocumentType, registerDocumentType } from "@/lib/documents/types";
import {
  PACKAGE_PREFIX,
  PACKAGE_SUBJECT,
  PACKAGE_TYPE,
  SAMPLE_DATA,
} from "../domain/package-rules";

/**
 * AC-9: a reprint is readable by the student of the enrollment, and by `cur.package.issue` holders
 * whose scope contains the enrollment's program (the sysadmin is covered by the engine).
 */
export async function mayReadPackage(
  user: { id: string },
  doc: { subjectType: string | null; subjectId: string | null },
): Promise<boolean> {
  if (doc.subjectType !== PACKAGE_SUBJECT || !doc.subjectId) return false;
  const enrollment = await db.enrollment.findUnique({
    where: { id: doc.subjectId },
    select: { programId: true, student: { select: { personId: true } } },
  });
  if (!enrollment) return false;
  if (await can(user, "cur.package.issue", { kind: "program", id: enrollment.programId }))
    return true;
  const u = await db.user.findUnique({ where: { id: user.id }, select: { personId: true } });
  return (
    !!u?.personId &&
    u.personId === enrollment.student.personId &&
    (await can(user, "cur.package.self"))
  );
}

/** AC-1: idempotent, so every entry point can call it. */
export function registerPackageType(): void {
  if (getDocumentType(PACKAGE_TYPE)) return;
  registerDocumentType({
    type: PACKAGE_TYPE,
    prefix: PACKAGE_PREFIX,
    sampleData: SAMPLE_DATA,
    canRead: (user, doc) => mayReadPackage(user, doc),
  });
}
