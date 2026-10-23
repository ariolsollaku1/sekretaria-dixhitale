import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";

type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  faculty: string;
  active: boolean;
};

/** AC-10: departments, filterable by faculty. */
export const departmentsTable = registerTable(
  defineTable<DepartmentRow>({
    id: "org.departments",
    permission: "org.department.read",
    exportName: "departments",
    rowKey: (r) => r.id,
    columns: [
      { key: "code", labelKey: "org.unit.code", type: "text", sortable: true, alwaysVisible: true },
      { key: "name", labelKey: "org.unit.name", type: "text", sortable: true },
      { key: "nameEn", labelKey: "org.unit.nameEn", type: "text", defaultVisible: false },
      { key: "faculty", labelKey: "org.unit.faculty", type: "text", sortable: true },
      { key: "status", labelKey: "org.columns.status", type: "text" },
    ],
    filters: [
      { key: "q", labelKey: "org.unit.search", type: "text" },
      { key: "faculty", labelKey: "org.unit.facultyCode", type: "text" },
      {
        key: "status",
        labelKey: "org.columns.status",
        type: "select",
        options: [
          { value: "active", labelKey: "org.unit.active" },
          { value: "inactive", labelKey: "org.unit.inactive" },
        ],
      },
    ],
    defaultSort: { key: "code", dir: "asc" },
    values: {
      code: (r) => r.code,
      name: (r) => r.name,
      nameEn: (r) => r.nameEn,
      faculty: (r) => r.faculty,
      status: (r, { t }) => t(r.active ? "org.unit.active" : "org.unit.inactive"),
    },
    cells: {
      code: (r) => (
        <Link href={`/org/departments/${r.id}`} className="font-tabular underline">
          {r.code}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge
          tone={r.active ? "success" : "neutral"}
          label={t(r.active ? "org.unit.active" : "org.unit.inactive")}
        />
      ),
    },
    async fetch(params) {
      const where: Prisma.DepartmentWhereInput = {};
      const q = params.filters.q;
      if (q)
        where.OR = [
          { code: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
        ];
      if (params.filters.faculty)
        where.faculty = { code: { contains: params.filters.faculty.toUpperCase() } };
      if (params.filters.status) where.active = params.filters.status === "active";
      const dir = params.sort.dir;
      const order: Prisma.DepartmentOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ name: dir }]
          : params.sort.key === "faculty"
            ? [{ faculty: { code: dir } }, { code: "asc" }]
            : [{ code: dir }];
      const [total, rows] = await Promise.all([
        db.department.count({ where }),
        db.department.findMany({
          where,
          orderBy: order,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          select: {
            id: true,
            code: true,
            name: true,
            nameEn: true,
            active: true,
            faculty: { select: { code: true } },
          },
        }),
      ]);
      return { total, rows: rows.map(({ faculty, ...r }) => ({ ...r, faculty: faculty.code })) };
    },
  }),
);
