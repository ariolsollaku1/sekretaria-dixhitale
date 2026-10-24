import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { REGISTRATION_TYPES } from "../domain/schemas";
import { scopeWhere, toDay } from "./student.queries";

type Row = {
  id: string;
  studentId: string;
  /** NTF-03: the person to message (never shown). */
  personId: string;
  studentNumber: string;
  name: string;
  faculty: string;
  program: string;
  cycle: string;
  registrationType: string;
  yearOfStudy: string;
  date: string;
  reason: string;
  documentRef: string;
};

/**
 * AC-1..AC-5: the three yearly Secretariat lists on one table (`list` filter): registered at the
 * start of the year by type, deregistered and suspended during the year. No personal identifiers.
 */
export const studentListsTable = registerTable(
  defineTable<Row>({
    id: "stu.lists",
    permission: "stu.student.read",
    exportName: "student-lists",
    rowKey: (r) => r.id,
    recipient: (r) => r.personId,
    columns: [
      {
        key: "studentNumber",
        labelKey: "stu.columns.studentNumber",
        type: "text",
        alwaysVisible: true,
      },
      { key: "name", labelKey: "stu.columns.name", type: "text", sortable: true },
      { key: "faculty", labelKey: "stu.lists.faculty", type: "text" },
      { key: "program", labelKey: "stu.columns.program", type: "text" },
      { key: "cycle", labelKey: "stu.columns.cycle", type: "text" },
      { key: "registrationType", labelKey: "stu.form.registrationType", type: "text" },
      { key: "yearOfStudy", labelKey: "stu.columns.yearOfStudy", type: "text" },
      { key: "date", labelKey: "stu.lists.date", type: "date" },
      { key: "reason", labelKey: "stu.change.reason", type: "text" },
      { key: "documentRef", labelKey: "stu.lists.documentRef", type: "text" },
    ],
    filters: [
      {
        key: "list",
        labelKey: "stu.lists.list",
        type: "select",
        options: ["registered", "deregistered", "suspended"].map((v) => ({
          value: v,
          labelKey: `stu.lists.kinds.${v}`,
        })),
      },
      { key: "program", labelKey: "stu.columns.programCode", type: "text" },
      { key: "faculty", labelKey: "stu.lists.facultyCode", type: "text" },
      {
        key: "cycle",
        labelKey: "stu.columns.cycle",
        type: "select",
        options: [
          { value: "FIRST", labelKey: "stu.cycle.FIRST" },
          { value: "SECOND", labelKey: "stu.cycle.SECOND" },
        ],
      },
      {
        key: "type",
        labelKey: "stu.form.registrationType",
        type: "select",
        options: REGISTRATION_TYPES.map((v) => ({
          value: v,
          labelKey: `stu.registrationType.${v}`,
        })),
      },
    ],
    defaultSort: { key: "name", dir: "asc" },
    values: {
      studentNumber: (r) => r.studentNumber,
      name: (r) => r.name,
      faculty: (r) => r.faculty,
      program: (r) => r.program,
      cycle: (r, { t }) => (r.cycle ? t(`stu.cycle.${r.cycle}`) : ""),
      registrationType: (r, { t }) =>
        r.registrationType ? t(`stu.registrationType.${r.registrationType}`) : "",
      yearOfStudy: (r) => r.yearOfStudy,
      date: (r) => r.date,
      reason: (r) => r.reason,
      documentRef: (r) => r.documentRef,
    },
    cells: {
      studentNumber: (r) => (
        <Link href={`/stu/students/${r.studentId}`} className="font-tabular underline">
          {r.studentNumber}
        </Link>
      ),
    },
    async fetch(params, { user }) {
      const yearId = await getSelectedAcademicYear();
      if (!yearId) return { total: 0, rows: [] };
      const year = await db.academicYear.findUnique({
        where: { id: yearId },
        select: { startDate: true, endDate: true },
      });
      if (!year) return { total: 0, rows: [] };
      const f = params.filters;
      const list = f.list === "deregistered" || f.list === "suspended" ? f.list : "registered";
      const studentWhere: Prisma.StudentWhereInput = await scopeWhere(user);
      const programWhere: Prisma.StudyProgramWhereInput = {
        ...(f.program ? { code: { contains: f.program.toUpperCase() } } : {}),
        ...(f.cycle ? { cycle: f.cycle as never } : {}),
        ...(f.faculty
          ? { department: { faculty: { code: { contains: f.faculty.toUpperCase() } } } }
          : {}),
      };
      const dir = params.sort.dir;
      const personOrder: Prisma.PersonOrderByWithRelationInput[] = [
        { lastName: dir },
        { firstName: dir },
      ];
      const page = { skip: (params.page - 1) * params.pageSize, take: params.pageSize };
      const program = {
        select: {
          code: true,
          cycle: true,
          department: { select: { faculty: { select: { code: true } } } },
        },
      };
      const student = {
        select: {
          id: true,
          personId: true,
          studentNumber: true,
          person: { select: { firstName: true, lastName: true } },
        },
      };

      if (list === "registered") {
        const where: Prisma.YearRegistrationWhereInput = {
          academicYearId: yearId,
          enrollment: {
            student: studentWhere,
            program: programWhere,
            ...(f.type ? { registrationType: f.type as never } : {}),
          },
        };
        const [total, rows] = await Promise.all([
          db.yearRegistration.count({ where }),
          db.yearRegistration.findMany({
            where,
            orderBy: [
              { enrollment: { student: { person: personOrder[0]! } } },
              { enrollment: { student: { person: personOrder[1]! } } },
            ],
            ...page,
            include: { enrollment: { include: { program, student } } },
          }),
        ]);
        return {
          total,
          rows: rows.map((r) => ({
            id: r.id,
            studentId: r.enrollment.student.id,
            personId: r.enrollment.student.personId,
            studentNumber: r.enrollment.student.studentNumber,
            name: `${r.enrollment.student.person.lastName} ${r.enrollment.student.person.firstName}`,
            faculty: r.enrollment.program.department.faculty.code,
            program: r.enrollment.program.code,
            cycle: r.enrollment.program.cycle,
            registrationType: r.enrollment.registrationType,
            yearOfStudy: String(r.yearOfStudy),
            date: toDay(r.enrollment.startedAt),
            reason: "",
            documentRef: "",
          })),
        };
      }

      const where: Prisma.EnrollmentStatusEventWhereInput = {
        toStatus: list === "deregistered" ? "DEREGISTERED" : "SUSPENDED",
        effectiveDate: { gte: year.startDate, lte: year.endDate },
        enrollment: { student: studentWhere, program: programWhere },
      };
      const [total, rows] = await Promise.all([
        db.enrollmentStatusEvent.count({ where }),
        db.enrollmentStatusEvent.findMany({
          where,
          orderBy: [
            { enrollment: { student: { person: personOrder[0]! } } },
            { enrollment: { student: { person: personOrder[1]! } } },
          ],
          ...page,
          include: { enrollment: { include: { program, student } } },
        }),
      ]);
      return {
        total,
        rows: rows.map((e) => ({
          id: e.id,
          studentId: e.enrollment.student.id,
          personId: e.enrollment.student.personId,
          studentNumber: e.enrollment.student.studentNumber,
          name: `${e.enrollment.student.person.lastName} ${e.enrollment.student.person.firstName}`,
          faculty: e.enrollment.program.department.faculty.code,
          program: e.enrollment.program.code,
          cycle: e.enrollment.program.cycle,
          registrationType: "",
          yearOfStudy: "",
          date: toDay(e.effectiveDate),
          reason: e.reason ?? "",
          documentRef: e.documentRef ?? "",
        })),
      };
    },
  }),
);
