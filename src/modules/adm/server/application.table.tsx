import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { missingRequired } from "../domain/application-rules";

export const APPLICATION_STATUSES = [
  "SUBMITTED",
  "IN_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "ENROLLED",
] as const;

const TONE: Record<string, StatusTone> = {
  SUBMITTED: "info",
  IN_REVIEW: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  ENROLLED: "success",
};

type Row = {
  id: string;
  reference: string;
  name: string;
  email: string;
  program: string;
  cycle: string;
  status: string;
  submittedAt: Date;
  missing: number;
};

/**
 * AC-11: applications for `adm.application.read`. Admissions are institution-wide (roles.md), so
 * the permission itself is the scope; a role without it never reaches `fetch`.
 */
export const applicationsTable = registerTable(
  defineTable<Row>({
    id: "adm.applications",
    permission: "adm.application.read",
    exportName: "applications",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "reference",
        labelKey: "adm.columns.reference",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "name", labelKey: "adm.columns.name", type: "text", sortable: true },
      { key: "email", labelKey: "adm.columns.email", type: "text", defaultVisible: false },
      { key: "program", labelKey: "adm.columns.program", type: "text", sortable: true },
      { key: "cycle", labelKey: "adm.columns.cycle", type: "text" },
      { key: "status", labelKey: "adm.columns.status", type: "text" },
      { key: "submittedAt", labelKey: "adm.columns.submittedAt", type: "datetime", sortable: true },
      { key: "missing", labelKey: "adm.columns.missing", type: "number" },
    ],
    filters: [
      { key: "reference", labelKey: "adm.columns.reference", type: "text" },
      { key: "name", labelKey: "adm.columns.name", type: "text" },
      { key: "email", labelKey: "adm.columns.email", type: "text" },
      { key: "program", labelKey: "adm.columns.programCode", type: "text" },
      { key: "cycle", labelKey: "adm.columns.cycle", type: "text" },
      {
        key: "status",
        labelKey: "adm.columns.status",
        type: "select",
        options: APPLICATION_STATUSES.map((v) => ({ value: v, labelKey: `adm.status.${v}` })),
      },
    ],
    defaultSort: { key: "submittedAt", dir: "desc" },
    values: {
      reference: (r) => r.reference,
      name: (r) => r.name,
      email: (r) => r.email,
      program: (r) => r.program,
      cycle: (r) => r.cycle,
      status: (r, { t }) => t(`adm.status.${r.status}`),
      submittedAt: (r) => r.submittedAt,
      missing: (r) => r.missing,
    },
    cells: {
      reference: (r) => (
        <Link href={`/adm/applications/${r.id}`} className="font-tabular underline">
          {r.reference}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge tone={TONE[r.status] ?? "neutral"} label={t(`adm.status.${r.status}`)} />
      ),
    },
    async fetch(params) {
      const f = params.filters;
      const and: Prisma.ApplicationWhereInput[] = [];
      if (f.reference) and.push({ reference: { contains: f.reference.toUpperCase() } });
      if (f.name)
        and.push({
          OR: [
            { firstName: { contains: f.name, mode: "insensitive" } },
            { lastName: { contains: f.name, mode: "insensitive" } },
          ],
        });
      if (f.email) and.push({ emailKey: { contains: f.email.toLowerCase() } });
      if (f.program) and.push({ program: { code: { contains: f.program.toUpperCase() } } });
      if (f.cycle) and.push({ cycle: { name: { contains: f.cycle, mode: "insensitive" } } });
      if (f.status) and.push({ status: f.status as never });
      const where: Prisma.ApplicationWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.ApplicationOrderByWithRelationInput[] =
        params.sort.key === "reference"
          ? [{ reference: dir }]
          : params.sort.key === "name"
            ? [{ lastName: dir }, { firstName: dir }, { id: "asc" }]
            : params.sort.key === "program"
              ? [{ program: { code: dir } }, { id: "asc" }]
              : [{ submittedAt: dir }, { id: "asc" }];
      const [total, rows] = await Promise.all([
        db.application.count({ where }),
        db.application.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            program: { select: { code: true } },
            cycle: { select: { name: true, documents: { select: { key: true, required: true } } } },
            documents: { where: { voidedAt: null }, select: { documentKey: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((a) => ({
          id: a.id,
          reference: a.reference,
          name: `${a.lastName} ${a.firstName}`,
          email: a.email,
          program: a.program.code,
          cycle: a.cycle.name,
          status: a.status,
          submittedAt: a.submittedAt,
          missing: missingRequired(
            a.cycle.documents,
            a.documents.map((d) => d.documentKey),
          ).length,
        })),
      };
    },
  }),
);
