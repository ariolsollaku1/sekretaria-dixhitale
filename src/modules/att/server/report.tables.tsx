import "server-only";
import Link from "next/link";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { defineTable, registerTable } from "@/lib/tables/define";
import type { FilterDef, TableParams } from "@/lib/tables/types";
import "../permissions";
import {
  attendanceRows,
  assignmentSummaries,
  type ReportFilters,
  type ReportRow,
  type SummaryRow,
} from "./report.queries";

const KINDS = ["LECTURE", "SEMINAR", "LAB"];

const commonFilters: FilterDef[] = [
  { key: "program", labelKey: "att.report.filters.program", type: "text" },
  { key: "group", labelKey: "att.report.filters.group", type: "text" },
  { key: "course", labelKey: "att.report.filters.course", type: "text" },
  {
    key: "kind",
    labelKey: "att.report.filters.kind",
    type: "select",
    options: KINDS.map((k) => ({ value: k, labelKey: `att.kind.${k}` })),
  },
  { key: "from", labelKey: "att.report.filters.from", type: "date" },
  { key: "to", labelKey: "att.report.filters.to", type: "date" },
  {
    key: "below",
    labelKey: "att.report.filters.below",
    type: "select",
    options: [{ value: "yes", labelKey: "att.report.filters.belowYes" }],
  },
];

async function filtersOf(params: TableParams): Promise<ReportFilters | null> {
  const yearId = await getSelectedAcademicYear();
  if (!yearId) return null;
  const f = params.filters;
  return {
    yearId,
    program: f.program,
    group: f.group,
    course: f.course,
    kind: f.kind,
    from: f.from,
    to: f.to,
    below: f.below === "yes",
  };
}

function page<T>(rows: T[], params: TableParams, cmp: (a: T, b: T) => number) {
  const dir = params.sort.dir === "desc" ? -1 : 1;
  const sorted = [...rows].sort((a, b) => cmp(a, b) * dir);
  const start = (params.page - 1) * params.pageSize;
  return { total: sorted.length, rows: sorted.slice(start, start + params.pageSize) };
}
const text = (a: string, b: string) => a.localeCompare(b, "sq");
const num = (a: number | null, b: number | null) => (a ?? -1) - (b ?? -1);

/** AC-3: student attendance per course, filtered and exportable. */
export const attReportTable = registerTable(
  defineTable<ReportRow>({
    id: "att.report",
    permission: "att.attendance.read",
    exportName: "attendance-report",
    rowKey: (r) => r.key,
    columns: [
      {
        key: "studentNumber",
        labelKey: "att.report.columns.studentNumber",
        type: "text",
        alwaysVisible: true,
        sortable: true,
      },
      { key: "name", labelKey: "att.report.columns.name", type: "text", sortable: true },
      { key: "program", labelKey: "att.report.columns.program", type: "text" },
      { key: "group", labelKey: "att.report.columns.group", type: "text" },
      { key: "course", labelKey: "att.report.columns.course", type: "text", sortable: true },
      { key: "kind", labelKey: "att.report.columns.kind", type: "text" },
      { key: "classes", labelKey: "att.report.columns.classes", type: "number" },
      { key: "heldHours", labelKey: "att.report.columns.heldHours", type: "number" },
      { key: "presentHours", labelKey: "att.report.columns.presentHours", type: "number" },
      { key: "absentHours", labelKey: "att.report.columns.absentHours", type: "number" },
      { key: "excusedHours", labelKey: "att.report.columns.excusedHours", type: "number" },
      { key: "percent", labelKey: "att.report.columns.percent", type: "number", sortable: true },
      { key: "below", labelKey: "att.report.columns.below", type: "text" },
    ],
    filters: commonFilters,
    defaultSort: { key: "name", dir: "asc" },
    values: {
      studentNumber: (r) => r.studentNumber,
      name: (r) => r.name,
      program: (r) => r.program,
      group: (r) => r.group,
      course: (r) => `${r.courseCode} ${r.courseName}`,
      kind: (r, { t }) => t(`att.kind.${r.kind}`),
      classes: (r) => r.classes,
      heldHours: (r) => r.heldHours,
      presentHours: (r) => r.presentHours,
      absentHours: (r) => r.absentHours,
      excusedHours: (r) => r.excusedHours,
      percent: (r) => r.percent,
      below: (r, { t }) => (r.below ? t("att.report.belowFlag") : ""),
    },
    cells: {
      studentNumber: (r) => (
        <Link href={`/stu/students/${r.studentId}`} className="font-tabular underline">
          {r.studentNumber}
        </Link>
      ),
    },
    async fetch(params, { user }) {
      const f = await filtersOf(params);
      if (!f) return { total: 0, rows: [] };
      const rows = await attendanceRows(user, f);
      const key = params.sort.key;
      return page(rows, params, (a, b) =>
        key === "percent"
          ? num(a.percent, b.percent)
          : key === "course"
            ? text(a.courseCode, b.courseCode) || text(a.kind, b.kind)
            : key === "studentNumber"
              ? text(a.studentNumber, b.studentNumber)
              : text(a.name, b.name) || text(a.courseCode, b.courseCode),
      );
    },
  }),
);

/** AC-4: per group and course summary. */
export const attSummaryTable = registerTable(
  defineTable<SummaryRow>({
    id: "att.summary",
    permission: "att.attendance.read",
    exportName: "attendance-summary",
    rowKey: (r) => r.assignmentId,
    columns: [
      { key: "program", labelKey: "att.report.columns.program", type: "text", sortable: true },
      { key: "group", labelKey: "att.report.columns.group", type: "text", sortable: true },
      { key: "course", labelKey: "att.report.columns.course", type: "text", sortable: true },
      { key: "kind", labelKey: "att.report.columns.kind", type: "text" },
      { key: "lecturer", labelKey: "att.report.columns.lecturer", type: "text" },
      { key: "classes", labelKey: "att.report.columns.classes", type: "number" },
      { key: "heldHours", labelKey: "att.report.columns.heldHours", type: "number" },
      { key: "students", labelKey: "att.report.columns.students", type: "number" },
      {
        key: "averagePercent",
        labelKey: "att.report.columns.averagePercent",
        type: "number",
        sortable: true,
      },
      {
        key: "belowCount",
        labelKey: "att.report.columns.belowCount",
        type: "number",
        sortable: true,
      },
    ],
    filters: commonFilters,
    defaultSort: { key: "program", dir: "asc" },
    values: {
      program: (r) => r.program,
      group: (r) => r.group,
      course: (r) => `${r.courseCode} ${r.courseName}`,
      kind: (r, { t }) => t(`att.kind.${r.kind}`),
      lecturer: (r) => r.lecturer,
      classes: (r) => r.classes,
      heldHours: (r) => r.heldHours,
      students: (r) => r.students,
      averagePercent: (r) => r.averagePercent,
      belowCount: (r) => r.below,
    },
    async fetch(params, { user }) {
      const f = await filtersOf(params);
      if (!f) return { total: 0, rows: [] };
      const rows = await assignmentSummaries(user, f);
      const key = params.sort.key;
      return page(rows, params, (a, b) =>
        key === "averagePercent"
          ? num(a.averagePercent, b.averagePercent)
          : key === "belowCount"
            ? a.below - b.below
            : key === "group"
              ? text(a.group, b.group)
              : key === "course"
                ? text(a.courseCode, b.courseCode)
                : text(a.program, b.program) ||
                  text(a.group, b.group) ||
                  text(a.courseCode, b.courseCode),
      );
    },
  }),
);
