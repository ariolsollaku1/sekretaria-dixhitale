import "server-only";
import { db } from "@/lib/db";
import { resolveProgramConfig, type ProgramConfig } from "../domain/program-rules";

/** AC-3: durations and subtypes from the settings, with defaults when unset or malformed. */
export async function getProgramConfig(
  client: Pick<typeof db, "systemSetting"> = db,
): Promise<ProgramConfig> {
  const rows = await client.systemSetting.findMany({
    where: { key: { in: ["org.programDurations", "org.programSubtypes"] } },
  });
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return resolveProgramConfig(get("org.programDurations"), get("org.programSubtypes"));
}

/** Subtype codes with names, for the form (settings hold the names). */
export async function listSubtypes(): Promise<{ code: string; nameSq: string; nameEn: string }[]> {
  const row = await db.systemSetting.findUnique({ where: { key: "org.programSubtypes" } });
  const config = await getProgramConfig();
  const named = Array.isArray(row?.value)
    ? (row.value as { code: string; nameSq: string; nameEn: string }[])
    : [];
  return config.subtypes.map(
    (code) => named.find((n) => n.code === code) ?? { code, nameSq: code, nameEn: code },
  );
}

/** AC-9: people who currently hold the program_coordinator role scoped to this program. */
export async function getProgramCoordinators(programId: string) {
  const now = new Date();
  const rows = await db.userRole.findMany({
    where: {
      role: "program_coordinator",
      scopeType: "PROGRAM",
      scopeId: programId,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      user: { active: true },
    },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.user);
}

export async function getProgram(id: string) {
  const program = await db.studyProgram.findUnique({
    where: { id },
    include: {
      department: {
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          faculty: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  if (!program) return null;
  return { ...program, coordinators: await getProgramCoordinators(id) };
}

export async function listDepartmentOptions() {
  const rows = await db.department.findMany({
    where: { active: true, faculty: { active: true } },
    orderBy: [{ faculty: { code: "asc" } }, { code: "asc" }],
    select: { id: true, code: true, name: true, faculty: { select: { code: true } } },
  });
  return rows.map((d) => ({ id: d.id, label: `${d.faculty.code} / ${d.code} — ${d.name}` }));
}
