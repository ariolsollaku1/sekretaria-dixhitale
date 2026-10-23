import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { scopeWhere } from "./student.queries";

type Row = {
  id: string;
  studentNumber: string;
  name: string;
  nim: string;
  program: string;
  cohort: string;
  yearOfStudy: string;
  group: string;
  status: string;
  gender: string;
  residence: string;
};

const TONE: Record<string, StatusTone> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  DEREGISTERED: "neutral",
  GRADUATED: "info",
};
const STATUSES = ["ACTIVE", "SUSPENDED", "DEREGISTERED", "GRADUATED"];

/**
 * AC-9: students within the user's scope. One row per student, showing the enrollment that matches
 * the filters (else the open one, else the latest). National ID, birth date and address are not
 * columns, so neither the list nor its export can leak them.
 */
export const studentsTable = registerTable(
  defineTable<Row>({
    id: "stu.students",
    permission: "stu.student.read",
    exportName: "students",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "studentNumber",
        labelKey: "stu.columns.studentNumber",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "name", labelKey: "stu.columns.name", type: "text", sortable: true },
      { key: "nim", labelKey: "stu.columns.nim", type: "text" },
      { key: "program", labelKey: "stu.columns.program", type: "text" },
      { key: "cohort", labelKey: "stu.columns.cohort", type: "text" },
      { key: "yearOfStudy", labelKey: "stu.columns.yearOfStudy", type: "text" },
      { key: "group", labelKey: "stu.columns.group", type: "text" },
      { key: "status", labelKey: "stu.columns.status", type: "text" },
      { key: "gender", labelKey: "stu.columns.gender", type: "text", defaultVisible: false },
      { key: "residence", labelKey: "stu.columns.residence", type: "text", defaultVisible: false },
    ],
    filters: [
      { key: "q", labelKey: "stu.columns.search", type: "text" },
      { key: "program", labelKey: "stu.columns.programCode", type: "text" },
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
        key: "yearOfStudy",
        labelKey: "stu.columns.yearOfStudy",
        type: "select",
        options: [1, 2, 3].map((n) => ({ value: String(n), labelKey: `stu.yearN.${n}` })),
      },
      { key: "group", labelKey: "stu.columns.groupName", type: "text" },
      {
        key: "status",
        labelKey: "stu.columns.status",
        type: "select",
        options: STATUSES.map((v) => ({ value: v, labelKey: `stu.status.${v}` })),
      },
      {
        key: "gender",
        labelKey: "stu.columns.gender",
        type: "select",
        options: [
          { value: "FEMALE", labelKey: "stu.gender.FEMALE" },
          { value: "MALE", labelKey: "stu.gender.MALE" },
        ],
      },
      { key: "residence", labelKey: "stu.columns.residence", type: "text" },
      { key: "academicYear", labelKey: "stu.columns.academicYearCode", type: "text" },
    ],
    defaultSort: { key: "studentNumber", dir: "asc" },
    values: {
      studentNumber: (r) => r.studentNumber,
      name: (r) => r.name,
      nim: (r) => r.nim,
      program: (r) => r.program,
      cohort: (r) => r.cohort,
      yearOfStudy: (r) => r.yearOfStudy,
      group: (r) => r.group,
      status: (r, { t }) => (r.status ? t(`stu.status.${r.status}`) : ""),
      gender: (r, { t }) => t(`stu.gender.${r.gender}`),
      residence: (r) => r.residence,
    },
    cells: {
      studentNumber: (r) => (
        <Link href={`/stu/students/${r.id}`} className="font-tabular underline">
          {r.studentNumber}
        </Link>
      ),
      status: (r, { t }) =>
        r.status ? (
          <StatusBadge tone={TONE[r.status] ?? "neutral"} label={t(`stu.status.${r.status}`)} />
        ) : null,
    },
    async fetch(params, { user }) {
      const f = params.filters;
      // the criteria on one enrollment (and its yearly registration) apply together
      const yearWhere: Prisma.YearRegistrationWhereInput = {};
      if (f.yearOfStudy) yearWhere.yearOfStudy = Number(f.yearOfStudy);
      if (f.group) yearWhere.group = { name: { contains: f.group, mode: "insensitive" } };
      if (f.academicYear) yearWhere.academicYear = { code: { contains: f.academicYear } };
      const enrollmentWhere: Prisma.EnrollmentWhereInput = {};
      if (f.program) enrollmentWhere.program = { code: { contains: f.program.toUpperCase() } };
      if (f.cycle)
        enrollmentWhere.program = {
          ...(enrollmentWhere.program as object),
          cycle: f.cycle as never,
        };
      if (f.status) enrollmentWhere.status = f.status as never;
      if (Object.keys(yearWhere).length > 0) enrollmentWhere.years = { some: yearWhere };
      const filtered = Object.keys(enrollmentWhere).length > 0;

      const and: Prisma.StudentWhereInput[] = [await scopeWhere(user)];
      if (filtered) and.push({ enrollments: { some: enrollmentWhere } });
      if (f.q)
        and.push({
          OR: [
            { studentNumber: { contains: f.q } },
            { nim: { contains: f.q, mode: "insensitive" } },
            { person: { firstName: { contains: f.q, mode: "insensitive" } } },
            { person: { lastName: { contains: f.q, mode: "insensitive" } } },
          ],
        });
      if (f.gender) and.push({ person: { gender: f.gender as never } });
      if (f.residence)
        and.push({ person: { residence: { contains: f.residence, mode: "insensitive" } } });
      const where: Prisma.StudentWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.StudentOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ person: { lastName: dir } }, { person: { firstName: dir } }]
          : [{ studentNumber: dir }];
      const [total, rows] = await Promise.all([
        db.student.count({ where }),
        db.student.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            person: { select: { firstName: true, lastName: true, gender: true, residence: true } },
            enrollments: {
              where: filtered ? enrollmentWhere : undefined,
              orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
              include: {
                program: { select: { code: true } },
                cohort: { select: { name: true } },
                years: {
                  where: Object.keys(yearWhere).length > 0 ? yearWhere : undefined,
                  orderBy: { academicYear: { startDate: "desc" } },
                  take: 1,
                  include: { group: { select: { name: true } } },
                },
              },
            },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((s) => {
          const e =
            s.enrollments.find((x) => x.status === "ACTIVE") ??
            s.enrollments.find((x) => x.status === "SUSPENDED") ??
            s.enrollments[0];
          const reg = e?.years[0];
          return {
            id: s.id,
            studentNumber: s.studentNumber,
            name: `${s.person.lastName} ${s.person.firstName}`,
            nim: s.nim ?? "",
            program: e?.program.code ?? "",
            cohort: e?.cohort.name ?? "",
            yearOfStudy: reg ? String(reg.yearOfStudy) : "",
            group: reg?.group.name ?? "",
            status: e?.status ?? "",
            gender: s.person.gender,
            residence: s.person.residence ?? "",
          };
        }),
      };
    },
  }),
);
