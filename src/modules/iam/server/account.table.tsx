import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n/format";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { daysSince } from "../domain/account-rules";

type Row = {
  id: string;
  name: string;
  email: string;
  kind: "student" | "staff";
  createdAt: Date;
  days: number;
  /** link to the student / staff page that holds the resend action */
  href: string;
};

const ORDER: Record<string, (dir: "asc" | "desc") => Prisma.UserOrderByWithRelationInput[]> = {
  name: (dir) => [{ name: dir }, { id: "asc" }],
  createdAt: (dir) => [{ createdAt: dir }, { id: "asc" }],
  days: (dir) => [{ createdAt: dir === "asc" ? "desc" : "asc" }, { id: "asc" }],
};

/**
 * IAM-02 AC-11 (Q-130): active accounts linked to a person that never signed in. A reader sees the
 * student accounts with `iam.account.student` and the staff accounts with `iam.account.staff`.
 */
export const neverActivatedTable = registerTable(
  defineTable<Row>({
    id: "iam.never-activated",
    permission: "iam.account.read",
    exportName: "accounts-never-activated",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "name",
        labelKey: "iam.columns.name",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "email", labelKey: "iam.columns.email", type: "text" },
      { key: "kind", labelKey: "iam.accounts.columns.kind", type: "text" },
      {
        key: "createdAt",
        labelKey: "iam.accounts.columns.createdAt",
        type: "datetime",
        sortable: true,
      },
      { key: "days", labelKey: "iam.accounts.columns.days", type: "text", sortable: true },
    ],
    filters: [
      { key: "q", labelKey: "iam.search", type: "text" },
      {
        key: "kind",
        labelKey: "iam.accounts.columns.kind",
        type: "select",
        options: [
          { value: "student", labelKey: "iam.accounts.kind.student" },
          { value: "staff", labelKey: "iam.accounts.kind.staff" },
        ],
      },
    ],
    defaultSort: { key: "days", dir: "desc" },
    values: {
      name: (r) => r.name,
      email: (r) => r.email,
      kind: (r, { t }) => t(`iam.accounts.kind.${r.kind}`),
      createdAt: (r) => r.createdAt,
      days: (r) => r.days,
    },
    cells: {
      name: (r) => (
        <Link href={r.href} className="underline">
          {r.name}
        </Link>
      ),
      createdAt: (r, { locale }) => formatDateTime(r.createdAt, locale),
    },
    async fetch(params, { user }) {
      const [students, staff] = await Promise.all([
        can(user, "iam.account.student"),
        can(user, "iam.account.staff"),
      ]);
      const kinds: Prisma.UserWhereInput[] = [];
      const wanted = params.filters.kind;
      if (students && wanted !== "staff") kinds.push({ person: { student: { isNot: null } } });
      if (staff && wanted !== "student") kinds.push({ person: { staff: { isNot: null } } });
      if (kinds.length === 0) return { rows: [], total: 0 };

      const and: Prisma.UserWhereInput[] = [
        { active: true, lastLoginAt: null, personId: { not: null } },
        { OR: kinds },
      ];
      const q = params.filters.q;
      if (q)
        and.push({
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        });
      const where: Prisma.UserWhereInput = { AND: and };

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
            createdAt: true,
            person: {
              select: { student: { select: { id: true } }, staff: { select: { id: true } } },
            },
          },
        }),
      ]);
      const now = new Date();
      return {
        total,
        rows: rows.map((r) => {
          const isStudent = !!r.person?.student && students && wanted !== "staff";
          return {
            id: r.id,
            name: r.name,
            email: r.email,
            kind: isStudent ? ("student" as const) : ("staff" as const),
            createdAt: r.createdAt,
            days: daysSince(r.createdAt, now),
            href: isStudent
              ? `/stu/students/${r.person!.student!.id}`
              : `/hr/staff/${r.person!.staff!.id}`,
          };
        }),
      };
    },
  }),
);
