import "server-only";
import { db } from "@/lib/db";
import { writableProgramIds } from "./announcement.queries";

/** Active programs the author may address. */
export async function listProgramOptions(user: { id: string }) {
  const ids = await writableProgramIds(user);
  const programs = await db.studyProgram.findMany({
    where: { active: true, id: { in: ids } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return programs.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
}
