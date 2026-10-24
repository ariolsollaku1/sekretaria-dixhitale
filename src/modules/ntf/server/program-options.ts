import "server-only";
import { db } from "@/lib/db";
import { writableProgramIds, type WritePermission } from "./announcement.queries";

/** Active programs the author may address (announcements by default; NTF-02 passes the event permission). */
export async function listProgramOptions(
  user: { id: string },
  permission: WritePermission = "ntf.announcement.write",
) {
  const ids = await writableProgramIds(user, permission);
  const programs = await db.studyProgram.findMany({
    where: { active: true, id: { in: ids } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return programs.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
}
