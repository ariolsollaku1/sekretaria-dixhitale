import "server-only";
import Link from "next/link";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { defineTable, registerTable } from "@/lib/tables/define";
import type { FilterDef, TableParams } from "@/lib/tables/types";
import "../permissions";
import { courseRows, monthRows, type CourseRow, type MonthRow } from "./hours.queries";

const CATEGORIES = ["PAE", "PAK", "VOLUNTEER"];
const STATES = ["PENDING", "APPROVED", "CHANGED", "OPEN"];

const categoryFilter: FilterDef = {
  key: "category",
  labelKey: "hr.hours.filters.category",
  type: "select",
  options: CATEGORIES.map((v) => ({ value: v, labelKey: `hr.category.${v}` })),
};
const common: FilterDef[] = [
  { key: "month", labelKey: "hr.hours.filters.month", type: "text" },
  categoryFilter,
  { key: "department", labelKey: "hr.hours.filters.department", type: "text" },
  { key: "lecturer", labelKey: "hr.hours.filters.lecturer", type: "text" },
];

async function filtersOf(params: TableParams) {
  const yearId = await getSelectedAcademicYear();
  if (!yearId) return null;
  const f = params.filters;
  return {
    yearId,
    month: f.month,
    semester: f.semester,
    category: f.category,
    department: f.department,
    lecturer: f.lecturer,
    course: f.course,
    state: f.state,
  };
}

function page<T>(rows: T[], params: TableParams, cmp: (a: T, b: T) => number) {
  const dir = params.sort.dir === "desc" ? -1 : 1;
  const sorted = [...rows].sort((a, b) => cmp(a, b) * dir);
  const start = (params.page - 1) * params.pageSize;
  return { total: sorted.length, rows: sorted.slice(start, start + params.pageSize) };
}
const text = (a: string, b: string) => a.localeCompare(b, "sq");

/** AC-3: delivered hours per lecturer and month with the approval state. */
export const hoursTable = registerTable(
  defineTable<MonthRow>({
    id: "hr.hours",
    permission: "hr.hours.read",
    exportName: "delivered-hours",
    rowKey: (r) => r.key,
    columns: [
      {
        key: "lecturer",
        labelKey: "hr.hours.columns.lecturer",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "category", labelKey: "hr.hours.columns.category", type: "text" },
      { key: "department", labelKey: "hr.hours.columns.department", type: "text" },
      { key: "month", labelKey: "hr.hours.columns.month", type: "text", sortable: true },
      { key: "sessions", labelKey: "hr.hours.columns.sessions", type: "number" },
      { key: "heldHours", labelKey: "hr.hours.columns.heldHours", type: "number" },
      { key: "adjustments", labelKey: "hr.hours.columns.adjustments", type: "number" },
      { key: "total", labelKey: "hr.hours.columns.total", type: "number", sortable: true },
      { key: "pending", labelKey: "hr.hours.columns.pending", type: "number" },
      { key: "state", labelKey: "hr.hours.columns.state", type: "text" },
    ],
    filters: [
      ...common,
      {
        key: "state",
        labelKey: "hr.hours.filters.state",
        type: "select",
        options: STATES.map((v) => ({ value: v, labelKey: `hr.hours.state.${v}` })),
      },
    ],
    defaultSort: { key: "month", dir: "desc" },
    values: {
      lecturer: (r) => r.name,
      category: (r, { t }) => t(`hr.category.${r.category}`),
      department: (r) => r.departmentCode,
      month: (r) => r.month,
      sessions: (r) => r.sessions,
      heldHours: (r) => r.heldHours,
      adjustments: (r) => r.adjustmentHours,
      total: (r) => r.total,
      pending: (r) => r.pending,
      state: (r, { t }) => t(`hr.hours.state.${r.state}`),
    },
    cells: {
      lecturer: (r) => (
        <Link href={`/hr/hours/${r.staffId}?month=${r.month}`} className="underline">
          {r.name}
        </Link>
      ),
    },
    async fetch(params, { user }) {
      const f = await filtersOf(params);
      if (!f) return { total: 0, rows: [] };
      const rows = await monthRows(user, f);
      const key = params.sort.key;
      return page(rows, params, (a, b) =>
        key === "total"
          ? a.total - b.total
          : key === "lecturer"
            ? text(a.name, b.name) || text(a.month, b.month)
            : text(a.month, b.month) || text(a.name, b.name),
      );
    },
  }),
);

/** AC-4: delivered hours per lecturer, course assignment and month. */
export const hoursReportTable = registerTable(
  defineTable<CourseRow>({
    id: "hr.hours-report",
    permission: "hr.hours.read",
    exportName: "delivered-hours-by-course",
    rowKey: (r) => r.key,
    columns: [
      {
        key: "lecturer",
        labelKey: "hr.hours.columns.lecturer",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "category", labelKey: "hr.hours.columns.category", type: "text" },
      { key: "department", labelKey: "hr.hours.columns.department", type: "text" },
      { key: "course", labelKey: "hr.hours.columns.course", type: "text", sortable: true },
      { key: "kind", labelKey: "hr.hours.columns.kind", type: "text" },
      { key: "group", labelKey: "hr.hours.columns.group", type: "text" },
      { key: "semester", labelKey: "hr.hours.columns.semester", type: "number" },
      { key: "month", labelKey: "hr.hours.columns.month", type: "text", sortable: true },
      { key: "sessions", labelKey: "hr.hours.columns.sessions", type: "number" },
      { key: "heldHours", labelKey: "hr.hours.columns.heldHours", type: "number" },
      { key: "adjustments", labelKey: "hr.hours.columns.adjustments", type: "number" },
      { key: "total", labelKey: "hr.hours.columns.total", type: "number", sortable: true },
    ],
    filters: [
      ...common,
      { key: "course", labelKey: "hr.hours.filters.course", type: "text" },
      {
        key: "semester",
        labelKey: "hr.hours.filters.semester",
        type: "select",
        options: [1, 2].map((n) => ({ value: String(n), labelKey: `cur.teaching.semesterN.${n}` })),
      },
    ],
    defaultSort: { key: "month", dir: "desc" },
    values: {
      lecturer: (r) => r.name,
      category: (r, { t }) => t(`hr.category.${r.category}`),
      department: (r) => r.departmentCode,
      course: (r) => `${r.courseCode} ${r.courseName}`,
      kind: (r, { t }) => t(`att.kind.${r.kind}`),
      group: (r) => r.groupLabel,
      semester: (r) => r.semester,
      month: (r) => r.month,
      sessions: (r) => r.sessions,
      heldHours: (r) => r.heldHours,
      adjustments: (r) => r.adjustmentHours,
      total: (r) => r.total,
    },
    cells: {
      lecturer: (r) => (
        <Link href={`/hr/hours/${r.staffId}?month=${r.month}`} className="underline">
          {r.name}
        </Link>
      ),
    },
    async fetch(params, { user }) {
      const f = await filtersOf(params);
      if (!f) return { total: 0, rows: [] };
      const rows = await courseRows(user, f);
      const key = params.sort.key;
      return page(rows, params, (a, b) =>
        key === "total"
          ? a.total - b.total
          : key === "lecturer"
            ? text(a.name, b.name) || text(a.month, b.month)
            : key === "course"
              ? text(a.courseCode, b.courseCode) || text(a.month, b.month)
              : text(a.month, b.month) || text(a.name, b.name) || text(a.courseCode, b.courseCode),
      );
    },
  }),
);
