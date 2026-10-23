import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";

type CourseRow = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  category: { nameSq: string; nameEn: string } | null;
  defaultCredits: number;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
  department: string;
  active: boolean;
};

const categoryName = (r: CourseRow, locale: string) =>
  r.category ? (locale === "en" ? r.category.nameEn : r.category.nameSq) : "";

/** AC-8: the course catalog on the shared table framework. */
export const coursesTable = registerTable(
  defineTable<CourseRow>({
    id: "cur.courses",
    permission: "cur.course.read",
    exportName: "courses",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "code",
        labelKey: "cur.course.code",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "name", labelKey: "cur.course.name", type: "text", sortable: true },
      { key: "nameEn", labelKey: "cur.course.nameEn", type: "text", defaultVisible: false },
      { key: "category", labelKey: "cur.course.category", type: "text" },
      { key: "credits", labelKey: "cur.course.credits", type: "number", sortable: true },
      {
        key: "hoursLecture",
        labelKey: "cur.course.hoursLecture",
        type: "number",
        defaultVisible: false,
      },
      {
        key: "hoursSeminar",
        labelKey: "cur.course.hoursSeminar",
        type: "number",
        defaultVisible: false,
      },
      { key: "hoursLab", labelKey: "cur.course.hoursLab", type: "number", defaultVisible: false },
      { key: "hours", labelKey: "cur.course.hours", type: "text" },
      { key: "department", labelKey: "cur.course.department", type: "text", sortable: true },
      { key: "status", labelKey: "cur.columns.status", type: "text" },
    ],
    filters: [
      { key: "q", labelKey: "cur.course.search", type: "text" },
      { key: "category", labelKey: "cur.course.categoryCode", type: "text" },
      { key: "department", labelKey: "cur.course.departmentCode", type: "text" },
      {
        key: "status",
        labelKey: "cur.columns.status",
        type: "select",
        options: [
          { value: "active", labelKey: "cur.status.active" },
          { value: "inactive", labelKey: "cur.status.inactive" },
        ],
      },
    ],
    defaultSort: { key: "code", dir: "asc" },
    values: {
      code: (r) => r.code,
      name: (r) => r.name,
      nameEn: (r) => r.nameEn,
      category: (r, { locale }) => categoryName(r, locale),
      credits: (r) => r.defaultCredits,
      hoursLecture: (r) => r.hoursLecture,
      hoursSeminar: (r) => r.hoursSeminar,
      hoursLab: (r) => r.hoursLab,
      hours: (r) => `${r.hoursLecture} / ${r.hoursSeminar} / ${r.hoursLab}`,
      department: (r) => r.department,
      status: (r, { t }) => t(r.active ? "cur.status.active" : "cur.status.inactive"),
    },
    cells: {
      code: (r) => (
        <Link href={`/cur/courses/${r.id}`} className="font-tabular underline">
          {r.code}
        </Link>
      ),
      category: (r, { locale }) => categoryName(r, locale) || "—",
      status: (r, { t }) => (
        <StatusBadge
          tone={r.active ? "success" : "neutral"}
          label={t(r.active ? "cur.status.active" : "cur.status.inactive")}
        />
      ),
    },
    async fetch(params) {
      const f = params.filters;
      const where: Prisma.CourseWhereInput = {};
      if (f.q)
        where.OR = [
          { code: { contains: f.q, mode: "insensitive" } },
          { name: { contains: f.q, mode: "insensitive" } },
          { nameEn: { contains: f.q, mode: "insensitive" } },
        ];
      if (f.category) where.category = { code: { contains: f.category.toUpperCase() } };
      if (f.department) where.department = { code: { contains: f.department.toUpperCase() } };
      if (f.status) where.active = f.status === "active";
      const dir = params.sort.dir;
      const order: Prisma.CourseOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ name: dir }]
          : params.sort.key === "credits"
            ? [{ defaultCredits: dir }, { code: "asc" }]
            : params.sort.key === "department"
              ? [{ department: { code: dir } }, { code: "asc" }]
              : [{ code: dir }];
      const [total, rows] = await Promise.all([
        db.course.count({ where }),
        db.course.findMany({
          where,
          orderBy: order,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          select: {
            id: true,
            code: true,
            name: true,
            nameEn: true,
            defaultCredits: true,
            hoursLecture: true,
            hoursSeminar: true,
            hoursLab: true,
            active: true,
            category: { select: { nameSq: true, nameEn: true } },
            department: { select: { code: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map(({ department, ...r }) => ({ ...r, department: department.code })),
      };
    },
  }),
);
