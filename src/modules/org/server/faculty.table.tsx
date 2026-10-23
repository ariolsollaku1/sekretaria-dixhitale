import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";

type FacultyRow = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  departments: number;
  active: boolean;
};

/** AC-10: faculties on the shared table framework. */
export const facultiesTable = registerTable(
  defineTable<FacultyRow>({
    id: "org.faculties",
    permission: "org.faculty.read",
    exportName: "faculties",
    rowKey: (r) => r.id,
    columns: [
      { key: "code", labelKey: "org.unit.code", type: "text", sortable: true, alwaysVisible: true },
      { key: "name", labelKey: "org.unit.name", type: "text", sortable: true },
      { key: "nameEn", labelKey: "org.unit.nameEn", type: "text", defaultVisible: false },
      { key: "departments", labelKey: "org.unit.departments", type: "number" },
      { key: "status", labelKey: "org.columns.status", type: "text" },
    ],
    filters: [
      { key: "q", labelKey: "org.unit.search", type: "text" },
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
      departments: (r) => r.departments,
      status: (r, { t }) => t(r.active ? "org.unit.active" : "org.unit.inactive"),
    },
    cells: {
      code: (r) => (
        <Link href={`/org/faculties/${r.id}`} className="font-tabular underline">
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
      const where: Prisma.FacultyWhereInput = {};
      const q = params.filters.q;
      if (q)
        where.OR = [
          { code: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
        ];
      if (params.filters.status) where.active = params.filters.status === "active";
      const order: Prisma.FacultyOrderByWithRelationInput[] =
        params.sort.key === "name" ? [{ name: params.sort.dir }] : [{ code: params.sort.dir }];
      const [total, rows] = await Promise.all([
        db.faculty.count({ where }),
        db.faculty.findMany({
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
            _count: { select: { departments: { where: { active: true } } } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map(({ _count, ...r }) => ({ ...r, departments: _count.departments })),
      };
    },
  }),
);
