import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import { getStaffBriefs } from "@/modules/hr";
import "../permissions";
import { aggregateLoad } from "../domain/load-rules";
import { teachingProgramScope } from "./teaching.queries";

type Row = {
  id: string;
  lecturer: string;
  category: string;
  department: string;
  courses: number;
  sem1: number;
  sem2: number;
  lecture: number;
  seminar: number;
  lab: number;
  total: number;
};

const NUMERIC = ["courses", "sem1", "sem2", "lecture", "seminar", "lab", "total"] as const;

/** AC-2: planned teaching load per lecturer for the selected academic year (delivered hours: HR-04). */
export const teachingLoadTable = registerTable(
  defineTable<Row>({
    id: "cur.teaching-load",
    permission: "cur.teaching.read",
    exportName: "teaching-load",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "lecturer",
        labelKey: "cur.load.columns.lecturer",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "category", labelKey: "cur.load.columns.category", type: "text" },
      { key: "department", labelKey: "cur.load.columns.department", type: "text" },
      { key: "courses", labelKey: "cur.load.columns.courses", type: "number", sortable: true },
      { key: "sem1", labelKey: "cur.load.columns.sem1", type: "number", sortable: true },
      { key: "sem2", labelKey: "cur.load.columns.sem2", type: "number", sortable: true },
      {
        key: "lecture",
        labelKey: "cur.load.columns.lecture",
        type: "number",
        defaultVisible: false,
      },
      {
        key: "seminar",
        labelKey: "cur.load.columns.seminar",
        type: "number",
        defaultVisible: false,
      },
      { key: "lab", labelKey: "cur.load.columns.lab", type: "number", defaultVisible: false },
      { key: "total", labelKey: "cur.load.columns.total", type: "number", sortable: true },
    ],
    filters: [
      {
        key: "category",
        labelKey: "cur.load.columns.category",
        type: "select",
        options: ["PAE", "PAK", "VOLUNTEER"].map((v) => ({
          value: v,
          labelKey: `hr.category.${v}`,
        })),
      },
      { key: "department", labelKey: "cur.load.columns.departmentCode", type: "text" },
      { key: "program", labelKey: "cur.load.columns.programCode", type: "text" },
      {
        key: "semester",
        labelKey: "cur.load.columns.semester",
        type: "select",
        options: [1, 2].map((n) => ({ value: String(n), labelKey: `cur.teaching.semesterN.${n}` })),
      },
    ],
    defaultSort: { key: "total", dir: "desc" },
    values: {
      lecturer: (r) => r.lecturer,
      category: (r, { t }) => (r.category ? t(`hr.category.${r.category}`) : ""),
      department: (r) => r.department,
      courses: (r) => r.courses,
      sem1: (r) => r.sem1,
      sem2: (r) => r.sem2,
      lecture: (r) => r.lecture,
      seminar: (r) => r.seminar,
      lab: (r) => r.lab,
      total: (r) => r.total,
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
      const assignments = await db.teachingAssignment.findMany({
        where: { AND: and },
        select: {
          staffId: true,
          planCourseId: true,
          semester: true,
          kind: true,
          plannedHours: true,
        },
      });
      const semester = f.semester === "1" ? 1 : f.semester === "2" ? 2 : undefined;
      const staff = await getStaffBriefs([...new Set(assignments.map((a) => a.staffId))]);
      let rows: Row[] = aggregateLoad(assignments, semester).map((a) => {
        const s = staff.get(a.staffId);
        return {
          id: a.staffId,
          lecturer: s?.name ?? "—",
          category: s?.category ?? "",
          department: s?.departmentCode ?? "",
          courses: a.courses,
          sem1: a.sem1,
          sem2: a.sem2,
          lecture: a.lecture,
          seminar: a.seminar,
          lab: a.lab,
          total: a.total,
        };
      });
      if (f.category) rows = rows.filter((r) => r.category === f.category);
      if (f.department)
        rows = rows.filter((r) => r.department.includes(f.department!.toUpperCase()));
      const dir = params.sort.dir === "asc" ? 1 : -1;
      const key = params.sort.key;
      rows.sort((a, b) =>
        (NUMERIC as readonly string[]).includes(key)
          ? dir *
              ((a[key as (typeof NUMERIC)[number]] as number) -
                (b[key as (typeof NUMERIC)[number]] as number)) ||
            a.lecturer.localeCompare(b.lecturer)
          : dir * a.lecturer.localeCompare(b.lecturer),
      );
      const start = (params.page - 1) * params.pageSize;
      return { total: rows.length, rows: rows.slice(start, start + params.pageSize) };
    },
  }),
);
