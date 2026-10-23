import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import { getStaffBriefs } from "@/modules/hr";
import "../permissions";
import { TEACHING_KINDS } from "../domain/teaching-rules";
import { teachingProgramScope } from "./teaching.queries";

type Row = {
  id: string;
  program: string;
  group: string;
  yearOfStudy: number;
  course: string;
  semester: number;
  kind: string;
  lecturer: string;
  category: string;
  hours: number;
};

/** AC-7: assignments of the selected academic year within the reader's programs. */
export const teachingTable = registerTable(
  defineTable<Row>({
    id: "cur.teaching",
    permission: "cur.teaching.read",
    exportName: "teaching-assignments",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "program",
        labelKey: "cur.teaching.columns.program",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "group", labelKey: "cur.teaching.columns.group", type: "text" },
      { key: "yearOfStudy", labelKey: "cur.teaching.columns.yearOfStudy", type: "number" },
      { key: "course", labelKey: "cur.teaching.columns.course", type: "text", sortable: true },
      {
        key: "semester",
        labelKey: "cur.teaching.columns.semester",
        type: "number",
        sortable: true,
      },
      { key: "kind", labelKey: "cur.teaching.columns.kind", type: "text" },
      { key: "lecturer", labelKey: "cur.teaching.columns.lecturer", type: "text" },
      {
        key: "category",
        labelKey: "cur.teaching.columns.category",
        type: "text",
        defaultVisible: false,
      },
      { key: "hours", labelKey: "cur.teaching.columns.hours", type: "number", sortable: true },
    ],
    filters: [
      { key: "program", labelKey: "cur.teaching.columns.programCode", type: "text" },
      { key: "course", labelKey: "cur.teaching.columns.courseCode", type: "text" },
      {
        key: "semester",
        labelKey: "cur.teaching.columns.semester",
        type: "select",
        options: [1, 2].map((n) => ({ value: String(n), labelKey: `cur.teaching.semesterN.${n}` })),
      },
      {
        key: "kind",
        labelKey: "cur.teaching.columns.kind",
        type: "select",
        options: TEACHING_KINDS.map((k) => ({ value: k, labelKey: `cur.teaching.kind.${k}` })),
      },
    ],
    defaultSort: { key: "program", dir: "asc" },
    values: {
      program: (r) => r.program,
      group: (r) => r.group,
      yearOfStudy: (r) => r.yearOfStudy,
      course: (r) => r.course,
      semester: (r) => r.semester,
      kind: (r, { t }) => t(`cur.teaching.kind.${r.kind}`),
      lecturer: (r) => r.lecturer,
      category: (r) => r.category,
      hours: (r) => r.hours,
    },
    async fetch(params, { user }) {
      const yearId = await getSelectedAcademicYear();
      if (!yearId) return { total: 0, rows: [] };
      const f = params.filters;
      const and: Prisma.TeachingAssignmentWhereInput[] = [
        {
          group: {
            academicYearId: yearId,
            cohort: { program: await teachingProgramScope(user, "cur.teaching.read") },
          },
        },
      ];
      if (f.program)
        and.push({
          group: { cohort: { program: { code: { contains: f.program.toUpperCase() } } } },
        });
      if (f.course)
        and.push({ planCourse: { course: { code: { contains: f.course.toUpperCase() } } } });
      if (f.semester) and.push({ semester: Number(f.semester) });
      if (f.kind) and.push({ kind: f.kind as never });
      const where: Prisma.TeachingAssignmentWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.TeachingAssignmentOrderByWithRelationInput[] =
        params.sort.key === "course"
          ? [{ planCourse: { course: { code: dir } } }]
          : params.sort.key === "semester"
            ? [{ semester: dir }, { planCourse: { course: { code: "asc" } } }]
            : params.sort.key === "hours"
              ? [{ plannedHours: dir }]
              : [
                  { group: { cohort: { program: { code: dir } } } },
                  { group: { name: "asc" } },
                  { semester: "asc" },
                ];
      const [total, rows] = await Promise.all([
        db.teachingAssignment.count({ where }),
        db.teachingAssignment.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            group: {
              select: {
                name: true,
                yearOfStudy: true,
                cohort: { select: { name: true, program: { select: { code: true } } } },
              },
            },
            planCourse: { select: { course: { select: { code: true, name: true } } } },
          },
        }),
      ]);
      const staff = await getStaffBriefs([...new Set(rows.map((r) => r.staffId))]);
      return {
        total,
        rows: rows.map((a) => ({
          id: a.id,
          program: a.group.cohort.program.code,
          group: `${a.group.cohort.name} · ${a.group.name}`,
          yearOfStudy: a.group.yearOfStudy,
          course: `${a.planCourse.course.code} — ${a.planCourse.course.name}`,
          semester: a.semester,
          kind: a.kind,
          lecturer: staff.get(a.staffId)?.name ?? "—",
          category: staff.get(a.staffId)?.category ?? "",
          hours: a.plannedHours,
        })),
      };
    },
  }),
);
