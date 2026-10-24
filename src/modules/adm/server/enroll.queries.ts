import "server-only";
import { db } from "@/lib/db";
import { listCohortOptions, listGroupOptions } from "@/modules/stu";
import { missingRequired } from "../domain/application-rules";
import { ENROLLABLE_STATUSES, personDraft } from "../domain/enroll-rules";

const day = (d: Date) => d.toISOString().slice(0, 10);

export type PlacementOptions = {
  cohorts: { id: string; label: string; groups: { id: string; label: string }[] }[];
};

/** AC-8, AC-9: the cohorts of one program with their active groups. */
export async function placementOptions(programId: string): Promise<PlacementOptions> {
  const cohorts = (await listCohortOptions()).filter((c) => c.programId === programId);
  return {
    cohorts: await Promise.all(
      cohorts.map(async (c) => ({
        id: c.id,
        label: c.label,
        groups: (await listGroupOptions(c.id)).map((g) => ({
          id: g.id,
          label: `${g.label} · ${g.yearOfStudy}`,
        })),
      })),
    ),
  };
}

export type EnrollDraft = {
  applicationId: string;
  status: string;
  programId: string;
  person: ReturnType<typeof personDraft>;
  missing: number;
  result: { studentId: string; enrolledAt: Date } | null;
};

/** AC-9: the application as the enrollment form needs it. */
export async function getEnrollDraft(applicationId: string): Promise<EnrollDraft | null> {
  const a = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      cycle: { select: { documents: { select: { key: true, required: true } } } },
      documents: { where: { voidedAt: null }, select: { documentKey: true } },
    },
  });
  if (!a) return null;
  return {
    applicationId: a.id,
    status: a.status,
    programId: a.programId,
    person: personDraft({ ...a, birthDate: day(a.birthDate) }),
    missing: missingRequired(
      a.cycle.documents,
      a.documents.map((d) => d.documentKey),
    ).length,
    result:
      a.studentId && a.enrolledAt ? { studentId: a.studentId, enrolledAt: a.enrolledAt } : null,
  };
}

export type EnrollableRow = {
  id: string;
  reference: string;
  name: string;
  cycle: string;
  status: string;
  missing: number;
};

/** AC-8: programs that have applications waiting, with the count. */
export async function listEnrollPrograms() {
  const groups = await db.application.groupBy({
    by: ["programId"],
    where: { status: { in: [...ENROLLABLE_STATUSES] } },
    _count: { _all: true },
  });
  const programs = await db.studyProgram.findMany({
    where: { id: { in: groups.map((g) => g.programId) } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const count = new Map(groups.map((g) => [g.programId, g._count._all]));
  return programs.map((p) => ({ ...p, waiting: count.get(p.id) ?? 0 }));
}

/** AC-8: enrollable applications of one program, oldest first. */
export async function listEnrollable(programId: string): Promise<EnrollableRow[]> {
  const rows = await db.application.findMany({
    where: { programId, status: { in: [...ENROLLABLE_STATUSES] } },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: 500,
    include: {
      cycle: { select: { name: true, documents: { select: { key: true, required: true } } } },
      documents: { where: { voidedAt: null }, select: { documentKey: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    reference: a.reference,
    name: `${a.lastName} ${a.firstName}`,
    cycle: a.cycle.name,
    status: a.status,
    missing: missingRequired(
      a.cycle.documents,
      a.documents.map((d) => d.documentKey),
    ).length,
  }));
}
