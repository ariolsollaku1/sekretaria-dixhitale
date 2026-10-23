import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { zonedDay } from "@/lib/i18n/zone";
import { ageBand, ageOn, type StatRecord } from "../domain/stat-rules";
import { scopeWhere } from "./student.queries";

export type StatFilters = { status: string; program: string; faculty: string; cycle: string };

/** AC-2: one record per enrollment of a student the user may see. Counts only; no identifiers leave this function. */
export async function statRecords(
  user: { id: string },
  filters: StatFilters,
): Promise<StatRecord[]> {
  const yearId = await getSelectedAcademicYear();
  const today = zonedDay(new Date());
  const where: Prisma.EnrollmentWhereInput = {
    student: await scopeWhere(user),
    program: {
      ...(filters.program ? { code: { contains: filters.program.toUpperCase() } } : {}),
      ...(filters.cycle ? { cycle: filters.cycle as never } : {}),
      ...(filters.faculty
        ? { department: { faculty: { code: { contains: filters.faculty.toUpperCase() } } } }
        : {}),
    },
    ...(filters.status !== "all" ? { status: filters.status as never } : {}),
  };
  const rows = await db.enrollment.findMany({
    where,
    select: {
      status: true,
      registrationType: true,
      program: {
        select: {
          code: true,
          cycle: true,
          department: { select: { faculty: { select: { code: true } } } },
        },
      },
      student: {
        select: { person: { select: { gender: true, residence: true, birthDate: true } } },
      },
      years: {
        where: yearId ? { academicYearId: yearId } : { id: "none" },
        select: { yearOfStudy: true },
        take: 1,
      },
    },
  });
  return rows.map((e) => ({
    faculty: e.program.department.faculty.code,
    cycle: e.program.cycle,
    program: e.program.code,
    yearOfStudy: e.years[0] ? String(e.years[0].yearOfStudy) : "",
    gender: e.student.person.gender,
    residence: e.student.person.residence?.trim() ?? "",
    ageBand: ageBand(ageOn(e.student.person.birthDate.toISOString().slice(0, 10), today)),
    status: e.status,
    registrationType: e.registrationType,
  }));
}
