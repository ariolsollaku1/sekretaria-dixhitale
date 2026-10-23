import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { CATEGORIES, KINDS } from "../domain/schemas";
import { scopeWhere, toDay } from "./staff.queries";

type Row = {
  id: string;
  name: string;
  kind: string;
  category: string;
  degree: string;
  title: string;
  department: string;
  retired: boolean;
  active: boolean;
  contractStart: string;
  contractEnd: string;
};

/**
 * AC-8: the staff list. National ID, birth date and address are not columns at all (AC-9), so the
 * list and its export cannot leak them.
 */
export const staffTable = registerTable(
  defineTable<Row>({
    id: "hr.staff",
    permission: "hr.staff.read",
    exportName: "staff",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "name",
        labelKey: "hr.columns.name",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "kind", labelKey: "hr.columns.kind", type: "text", sortable: true },
      { key: "category", labelKey: "hr.columns.category", type: "text", sortable: true },
      { key: "degree", labelKey: "hr.columns.degree", type: "text" },
      { key: "title", labelKey: "hr.columns.title", type: "text" },
      { key: "department", labelKey: "hr.columns.department", type: "text", sortable: true },
      { key: "retired", labelKey: "hr.columns.retired", type: "boolean", defaultVisible: false },
      { key: "contractStart", labelKey: "hr.columns.contractStart", type: "date", sortable: true },
      { key: "contractEnd", labelKey: "hr.columns.contractEnd", type: "date", sortable: true },
      { key: "status", labelKey: "hr.columns.status", type: "text" },
    ],
    filters: [
      { key: "q", labelKey: "hr.columns.search", type: "text" },
      {
        key: "kind",
        labelKey: "hr.columns.kind",
        type: "select",
        options: KINDS.map((v) => ({ value: v, labelKey: `hr.kind.${v}` })),
      },
      {
        key: "category",
        labelKey: "hr.columns.category",
        type: "select",
        options: CATEGORIES.map((v) => ({ value: v, labelKey: `hr.category.${v}` })),
      },
      { key: "department", labelKey: "hr.columns.departmentCode", type: "text" },
      {
        key: "retired",
        labelKey: "hr.columns.retired",
        type: "select",
        options: [
          { value: "yes", labelKey: "hr.yes" },
          { value: "no", labelKey: "hr.no" },
        ],
      },
      {
        key: "status",
        labelKey: "hr.columns.status",
        type: "select",
        options: [
          { value: "active", labelKey: "hr.status.active" },
          { value: "inactive", labelKey: "hr.status.inactive" },
        ],
      },
    ],
    defaultSort: { key: "name", dir: "asc" },
    values: {
      name: (r) => r.name,
      kind: (r, { t }) => t(`hr.kind.${r.kind}`),
      category: (r, { t }) => t(`hr.category.${r.category}`),
      degree: (r) => r.degree,
      title: (r) => r.title,
      department: (r) => r.department,
      retired: (r) => r.retired,
      contractStart: (r) => r.contractStart,
      contractEnd: (r) => r.contractEnd,
      status: (r, { t }) => t(r.active ? "hr.status.active" : "hr.status.inactive"),
    },
    cells: {
      name: (r) => (
        <Link href={`/hr/staff/${r.id}`} className="underline">
          {r.name}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge
          tone={r.active ? "success" : "neutral"}
          label={t(r.active ? "hr.status.active" : "hr.status.inactive")}
        />
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const and: Prisma.StaffWhereInput[] = [await scopeWhere(user)];
      if (f.q)
        and.push({
          person: {
            OR: [
              { firstName: { contains: f.q, mode: "insensitive" } },
              { lastName: { contains: f.q, mode: "insensitive" } },
            ],
          },
        });
      if (f.kind) and.push({ kind: f.kind as Row["kind"] as never });
      if (f.category) and.push({ category: f.category as never });
      if (f.department)
        and.push({ department: { code: { contains: f.department.toUpperCase() } } });
      if (f.retired) and.push({ retired: f.retired === "yes" });
      if (f.status) and.push({ active: f.status === "active" });
      const where: Prisma.StaffWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.StaffOrderByWithRelationInput[] =
        params.sort.key === "kind"
          ? [{ kind: dir }, { person: { lastName: "asc" } }]
          : params.sort.key === "category"
            ? [{ category: dir }, { person: { lastName: "asc" } }]
            : params.sort.key === "department"
              ? [{ department: { code: dir } }, { person: { lastName: "asc" } }]
              : params.sort.key === "contractStart"
                ? [{ contractStart: dir }]
                : params.sort.key === "contractEnd"
                  ? [{ contractEnd: { sort: dir, nulls: "last" } }]
                  : [{ person: { lastName: dir } }, { person: { firstName: dir } }];
      const [total, rows] = await Promise.all([
        db.staff.count({ where }),
        db.staff.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            person: { select: { firstName: true, lastName: true } },
            department: { select: { code: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((s) => ({
          id: s.id,
          name: `${s.person.lastName} ${s.person.firstName}`,
          kind: s.kind,
          category: s.category,
          degree: s.degree ?? "",
          title: s.title ?? "",
          department: s.department?.code ?? "",
          retired: s.retired,
          active: s.active,
          contractStart: toDay(s.contractStart),
          contractEnd: s.contractEnd ? toDay(s.contractEnd) : "",
        })),
      };
    },
  }),
);
