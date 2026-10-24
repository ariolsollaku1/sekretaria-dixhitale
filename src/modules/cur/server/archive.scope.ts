import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can, grantScopes } from "@/lib/authz/guard";

/** Programs the user may view in the archive (AC-7). `null` = all of them. */
export async function archiveProgramWhere(user: {
  id: string;
}): Promise<Prisma.StudyProgramWhereInput> {
  if (!(await can(user, "cur.archive.view"))) return { id: { in: [] } };
  const g = await grantScopes(user, "cur.archive.view");
  if (g.institution) return {};
  return {
    OR: [
      { id: { in: g.programIds } },
      { departmentId: { in: g.departmentIds } },
      { department: { facultyId: { in: g.facultyIds } } },
    ],
  };
}

/** AC-7/AC-9: documents of programs in scope plus institution-wide ones; withdrawn ones for writers. */
export async function archiveDocumentWhere(user: {
  id: string;
}): Promise<Prisma.ApprovedDocumentWhereInput> {
  if (!(await can(user, "cur.archive.view"))) return { id: { in: [] } };
  const g = await grantScopes(user, "cur.archive.view");
  // an empty relation filter would not match; institution scope simply sees every document
  const scope: Prisma.ApprovedDocumentWhereInput = g.institution
    ? {}
    : { OR: [{ programId: null }, { program: await archiveProgramWhere(user) }] };
  if (await can(user, "cur.archive.write")) return scope;
  return { AND: [scope, { status: "ACTIVE" }] };
}
