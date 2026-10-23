import "server-only";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/authz/roles";
import { formatDateTime } from "@/lib/i18n/format";
import { defineTable, registerTable } from "@/lib/tables/define";
import type { Prisma } from "@/generated/prisma/client";

type UserRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastLoginAt: Date | null;
  roles: string[];
};

const ORDER: Record<string, (dir: "asc" | "desc") => Prisma.UserOrderByWithRelationInput[]> = {
  name: (dir) => [{ name: dir }, { id: "asc" }],
  email: (dir) => [{ email: dir }, { id: "asc" }],
  lastLogin: (dir) => [{ lastLoginAt: { sort: dir, nulls: "last" } }, { id: "asc" }],
};

/** IAM-01 AC-1 on the shared table framework (PLT-10): search, role and status filters. */
export const usersTable = registerTable(
  defineTable<UserRow>({
    id: "iam.users",
    permission: "iam.user.read",
    exportName: "users",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "name",
        labelKey: "iam.columns.name",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "email", labelKey: "iam.columns.email", type: "text", sortable: true },
      { key: "roles", labelKey: "iam.columns.roles", type: "text" },
      { key: "status", labelKey: "iam.columns.status", type: "text" },
      { key: "lastLogin", labelKey: "iam.columns.lastLogin", type: "datetime", sortable: true },
    ],
    filters: [
      { key: "q", labelKey: "iam.search", type: "text" },
      {
        key: "role",
        labelKey: "iam.filters.role",
        type: "select",
        options: ROLES.map((r) => ({ value: r, labelKey: `roles.${r}` })),
      },
      {
        key: "status",
        labelKey: "iam.filters.status",
        type: "select",
        options: [
          { value: "active", labelKey: "iam.filters.active" },
          { value: "inactive", labelKey: "iam.filters.inactive" },
        ],
      },
    ],
    defaultSort: { key: "name", dir: "asc" },
    values: {
      name: (r) => r.name,
      email: (r) => r.email,
      roles: (r, { t }) => r.roles.map((role) => t(`roles.${role}`)).join(", "),
      status: (r, { t }) => t(r.active ? "iam.status.active" : "iam.status.inactive"),
      lastLogin: (r) => r.lastLoginAt,
    },
    cells: {
      name: (r) => (
        <Link href={`/admin/users/${r.id}`} className="underline">
          {r.name}
        </Link>
      ),
      roles: (r, { t }) => r.roles.map((role) => t(`roles.${role}`)).join(", ") || "—",
      status: (r, { t }) => (
        <StatusBadge
          tone={r.active ? "success" : "neutral"}
          label={t(r.active ? "iam.status.active" : "iam.status.inactive")}
        />
      ),
      lastLogin: (r, { t, locale }) =>
        r.lastLoginAt ? formatDateTime(r.lastLoginAt, locale) : t("iam.neverLoggedIn"),
    },
    async fetch(params) {
      const where: Prisma.UserWhereInput = {};
      const q = params.filters.q;
      if (q)
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ];
      if (params.filters.role)
        where.roles = { some: { role: params.filters.role as (typeof ROLES)[number] } };
      if (params.filters.status) where.active = params.filters.status === "active";

      const [total, rows] = await Promise.all([
        db.user.count({ where }),
        db.user.findMany({
          where,
          orderBy: ORDER[params.sort.key]!(params.sort.dir),
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            lastLoginAt: true,
            roles: { select: { role: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r) => ({ ...r, roles: [...new Set(r.roles.map((x) => x.role))] })),
      };
    },
  }),
);
