import "server-only";
import { db, type Tx } from "@/lib/db";

export type GroupContext = {
  id: string;
  name: string;
  active: boolean;
  yearOfStudy: number;
  academicYearId: string;
  yearStatus: "PLANNED" | "CURRENT" | "CLOSED";
  cohortId: string;
  cohortPlanId: string;
  programId: string;
  programCode: string;
};

/** For other modules (CUR-04): where a group belongs and which plan its cohort follows. */
export async function getGroupContext(
  groupId: string,
  client: Pick<Tx, "studentGroup"> = db,
): Promise<GroupContext | null> {
  const g = await client.studentGroup.findUnique({
    where: { id: groupId },
    include: {
      academicYear: { select: { status: true } },
      cohort: {
        select: {
          id: true,
          curriculumPlanId: true,
          programId: true,
          program: { select: { code: true } },
        },
      },
    },
  });
  return g
    ? {
        id: g.id,
        name: g.name,
        active: g.active,
        yearOfStudy: g.yearOfStudy,
        academicYearId: g.academicYearId,
        yearStatus: g.academicYear.status,
        cohortId: g.cohort.id,
        cohortPlanId: g.cohort.curriculumPlanId,
        programId: g.cohort.programId,
        programCode: g.cohort.program.code,
      }
    : null;
}

/** Active groups of an academic year for pickers: "PROGRAM · cohort · group · year N". */
export async function listGroupsForYear(
  academicYearId: string,
  client: Pick<Tx, "studentGroup"> = db,
) {
  const groups = await client.studentGroup.findMany({
    where: { academicYearId, active: true },
    orderBy: [{ cohort: { program: { code: "asc" } } }, { yearOfStudy: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      yearOfStudy: true,
      cohort: { select: { name: true, program: { select: { code: true } } } },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    label: `${g.cohort.program.code} · ${g.cohort.name} · ${g.name} (${g.yearOfStudy})`,
  }));
}
