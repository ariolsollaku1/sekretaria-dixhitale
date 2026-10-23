import "server-only";
import { db, type Tx } from "@/lib/db";

export type AssignmentContext = {
  id: string;
  groupId: string;
  groupName: string;
  staffId: string;
  kind: "LECTURE" | "SEMINAR" | "LAB";
  semester: number;
  courseCode: string;
  courseName: string;
  programId: string;
  programCode: string;
  cohortName: string;
  academicYearId: string;
  yearStatus: "PLANNED" | "CURRENT" | "CLOSED";
};

const include = {
  group: {
    select: {
      name: true,
      academicYearId: true,
      academicYear: { select: { status: true } },
      cohort: { select: { name: true, programId: true, program: { select: { code: true } } } },
    },
  },
  planCourse: { select: { course: { select: { code: true, name: true } } } },
} as const;

type Row = Awaited<ReturnType<typeof load>>[number];
const load = (client: Pick<Tx, "teachingAssignment">, where: object) =>
  client.teachingAssignment.findMany({
    where,
    include,
    orderBy: [{ semester: "asc" }, { kind: "asc" }],
  });

const view = (a: Row): AssignmentContext => ({
  id: a.id,
  groupId: a.groupId,
  groupName: a.group.name,
  staffId: a.staffId,
  kind: a.kind,
  semester: a.semester,
  courseCode: a.planCourse.course.code,
  courseName: a.planCourse.course.name,
  programId: a.group.cohort.programId,
  programCode: a.group.cohort.program.code,
  cohortName: a.group.cohort.name,
  academicYearId: a.group.academicYearId,
  yearStatus: a.group.academicYear.status,
});

/** For other modules (CAL-02 timetable): where an assignment is and what it teaches. */
export async function getAssignmentContext(
  id: string,
  client: Pick<Tx, "teachingAssignment"> = db,
) {
  const rows = await load(client, { id });
  return rows[0] ? view(rows[0]) : null;
}

export async function listGroupAssignments(
  groupId: string,
  client: Pick<Tx, "teachingAssignment"> = db,
) {
  return (await load(client, { groupId })).map(view);
}

export async function listStaffAssignments(
  staffId: string,
  academicYearId: string,
  client: Pick<Tx, "teachingAssignment"> = db,
) {
  return (await load(client, { staffId, group: { academicYearId } })).map(view);
}
