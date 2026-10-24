import "server-only";
import { db } from "@/lib/db";
import { isCycleOpen, missingRequired, todayInTirane } from "../domain/application-rules";

const day = (d: Date) => d.toISOString().slice(0, 10);

export type CycleView = {
  id: string;
  academicYearId: string;
  academicYear: string;
  name: string;
  opensOn: string;
  closesOn: string;
  active: boolean;
  open: boolean;
  applications: number;
  documents: { key: string; labelSq: string; labelEn: string | null; required: boolean }[];
};

/** AC-1: every cycle with its document list and the number of applications. */
export async function listCycles(now = new Date()): Promise<CycleView[]> {
  const today = todayInTirane(now);
  const cycles = await db.applicationCycle.findMany({
    orderBy: [{ opensOn: "desc" }, { name: "asc" }],
    include: {
      academicYear: { select: { code: true } },
      documents: { orderBy: { sequence: "asc" } },
      _count: { select: { applications: true } },
    },
  });
  return cycles.map((c) => ({
    id: c.id,
    academicYearId: c.academicYearId,
    academicYear: c.academicYear.code,
    name: c.name,
    opensOn: day(c.opensOn),
    closesOn: day(c.closesOn),
    active: c.active,
    open: isCycleOpen(
      { active: c.active, opensOn: day(c.opensOn), closesOn: day(c.closesOn) },
      today,
    ),
    applications: c._count.applications,
    documents: c.documents.map((d) => ({
      key: d.key,
      labelSq: d.labelSq,
      labelEn: d.labelEn,
      required: d.required,
    })),
  }));
}

export type OpenCycle = { id: string; name: string; closesOn: string };
export type ProgramChoice = { id: string; code: string; name: string; nameEn: string | null };

/** AC-2: cycles open today, and the active programs of the offer (Q-96). */
export async function openOffer(now = new Date()) {
  const today = todayInTirane(now);
  const [cycles, programs] = await Promise.all([
    db.applicationCycle.findMany({
      where: { active: true, opensOn: { lte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { closesOn: "asc" },
    }),
    db.studyProgram.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, nameEn: true },
    }),
  ]);
  return {
    cycles: cycles
      .map((c) => ({ id: c.id, name: c.name, opensOn: day(c.opensOn), closesOn: day(c.closesOn) }))
      .filter((c) => isCycleOpen({ active: true, opensOn: c.opensOn, closesOn: c.closesOn }, today))
      .map(({ id, name, closesOn }): OpenCycle => ({ id, name, closesOn })),
    programs: programs satisfies ProgramChoice[],
  };
}

/** AC-11: the application with everything staff may see. */
export async function getApplicationDetail(id: string) {
  const a = await db.application.findUnique({
    where: { id },
    include: {
      program: { select: { code: true, name: true, nameEn: true } },
      cycle: {
        include: {
          academicYear: { select: { code: true } },
          documents: { orderBy: { sequence: "asc" } },
        },
      },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!a) return null;
  const files = await db.storedFile.findMany({
    where: { id: { in: a.documents.map((d) => d.fileId) } },
    select: { id: true, fileName: true, size: true },
  });
  const file = new Map(files.map((f) => [f.id, f]));
  const live = a.documents.filter((d) => !d.voidedAt);
  return {
    id: a.id,
    reference: a.reference,
    status: a.status,
    submittedAt: a.submittedAt,
    cycle: a.cycle.name,
    academicYear: a.cycle.academicYear.code,
    program: a.program,
    person: {
      firstName: a.firstName,
      lastName: a.lastName,
      fatherName: a.fatherName,
      gender: a.gender,
      birthDate: day(a.birthDate),
      birthPlace: a.birthPlace,
      nationalId: a.nationalId,
      email: a.email,
      phone: a.phone,
      address: a.address,
      residence: a.residence,
    },
    education: {
      schoolName: a.schoolName,
      schoolCity: a.schoolCity,
      graduationYear: a.graduationYear,
      averageGrade: a.averageGrade.toFixed(2),
    },
    documents: a.cycle.documents.map((t) => {
      const doc = live.find((d) => d.documentKey === t.key);
      return {
        key: t.key,
        labelSq: t.labelSq,
        labelEn: t.labelEn,
        required: t.required,
        file: doc
          ? {
              id: doc.fileId,
              name: file.get(doc.fileId)?.fileName ?? "—",
              size: file.get(doc.fileId)?.size ?? 0,
              uploadedAt: doc.uploadedAt,
            }
          : null,
      };
    }),
    missing: missingRequired(
      a.cycle.documents,
      live.map((d) => d.documentKey),
    ),
  };
}
export type ApplicationDetail = NonNullable<Awaited<ReturnType<typeof getApplicationDetail>>>;
