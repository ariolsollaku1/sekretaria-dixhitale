import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { byProgram, distribution, summarize, type EntryRecord } from "../domain/entry-rules";
import { scopeWhere } from "./student.queries";

export type EntryFilters = { program: string; faculty: string; cycle: string };

export type EntryRow = EntryRecord & {
  studentNumber: string;
  name: string;
  programName: string;
  cohort: string;
  schoolName: string | null;
  graduationYear: number | null;
};

/**
 * STU-05 AC-1/AC-5: first-registration enrollments of the students the user may see whose cohort
 * starts in `yearId` (all years when null), each with the average from the application it came from
 * (ADM-04 link), or none. Q-148.
 */
export async function entryRows(
  user: { id: string },
  yearId: string | null,
  filters: EntryFilters,
): Promise<EntryRow[]> {
  const where: Prisma.EnrollmentWhereInput = {
    student: await scopeWhere(user),
    registrationType: "FIRST_TIME",
    ...(yearId ? { cohort: { startAcademicYearId: yearId } } : {}),
    program: {
      ...(filters.program ? { code: { contains: filters.program.toUpperCase() } } : {}),
      ...(filters.cycle ? { cycle: filters.cycle as never } : {}),
      ...(filters.faculty
        ? { department: { faculty: { code: { contains: filters.faculty.toUpperCase() } } } }
        : {}),
    },
  };
  const rows = await db.enrollment.findMany({
    where,
    select: {
      program: { select: { code: true, name: true } },
      cohort: { select: { name: true } },
      student: {
        select: {
          studentNumber: true,
          person: { select: { firstName: true, lastName: true } },
        },
      },
      application: { select: { averageGrade: true, schoolName: true, graduationYear: true } },
    },
    orderBy: [{ program: { code: "asc" } }, { student: { studentNumber: "asc" } }],
  });
  return rows.map((e) => ({
    program: e.program.code,
    programName: e.program.name,
    cohort: e.cohort.name,
    studentNumber: e.student.studentNumber,
    name: `${e.student.person.firstName} ${e.student.person.lastName}`,
    average: e.application ? Number(e.application.averageGrade) : null,
    schoolName: e.application?.schoolName ?? null,
    graduationYear: e.application?.graduationYear ?? null,
  }));
}

/** The whole report for the academic year selected in the header: list, summary, bands, programs. */
export async function entryReport(user: { id: string }, filters: EntryFilters) {
  const rows = await entryRows(user, await getSelectedAcademicYear(), filters);
  return {
    rows,
    summary: summarize(rows),
    distribution: distribution(rows),
    programs: byProgram(rows),
  };
}
