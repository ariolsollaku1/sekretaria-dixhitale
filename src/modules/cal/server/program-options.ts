import "server-only";
import { db } from "@/lib/db";

/** Active programs for the audience picker. */
export async function listProgramOptions() {
  const programs = await db.studyProgram.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return programs.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
}
