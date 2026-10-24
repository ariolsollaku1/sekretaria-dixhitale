import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { LEAD_SOURCES, LEAD_STATUSES } from "../domain/lead-rules";

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string;
  program: string;
  source: string;
  sourceNote: string;
  status: string;
  consent: boolean;
  assignee: string;
  createdAt: Date;
};

const TONE: Record<string, StatusTone> = {
  NEW: "info",
  CONTACTED: "warning",
  APPLIED: "success",
  LOST: "neutral",
};

/**
 * AC-5: the leads list. Institution-wide for every holder of `adm.lead.read` (a lead has no program
 * scope, Q-136); the permission is checked by the page and the export route.
 */
export const leadsTable = registerTable(
  defineTable<Row>({
    id: "adm.leads",
    permission: "adm.lead.read",
    exportName: "leads",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "name",
        labelKey: "adm.leadColumns.name",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "email", labelKey: "adm.leadColumns.email", type: "text" },
      { key: "phone", labelKey: "adm.leadColumns.phone", type: "text" },
      { key: "program", labelKey: "adm.leadColumns.program", type: "text" },
      { key: "source", labelKey: "adm.leadColumns.source", type: "text" },
      {
        key: "sourceNote",
        labelKey: "adm.leadColumns.sourceNote",
        type: "text",
        defaultVisible: false,
      },
      { key: "status", labelKey: "adm.leadColumns.status", type: "text", sortable: true },
      {
        key: "consent",
        labelKey: "adm.leadColumns.consent",
        type: "boolean",
        defaultVisible: false,
      },
      { key: "assignee", labelKey: "adm.leadColumns.assignee", type: "text" },
      { key: "createdAt", labelKey: "adm.leadColumns.createdAt", type: "datetime", sortable: true },
    ],
    filters: [
      { key: "name", labelKey: "adm.leadColumns.name", type: "text" },
      { key: "email", labelKey: "adm.leadColumns.email", type: "text" },
      {
        key: "status",
        labelKey: "adm.leadColumns.status",
        type: "select",
        options: LEAD_STATUSES.map((v) => ({ value: v, labelKey: `adm.leadStatus.${v}` })),
      },
      {
        key: "source",
        labelKey: "adm.leadColumns.source",
        type: "select",
        options: LEAD_SOURCES.map((v) => ({ value: v, labelKey: `adm.source.${v}` })),
      },
      { key: "program", labelKey: "adm.leadColumns.programCode", type: "text" },
    ],
    defaultSort: { key: "createdAt", dir: "desc" },
    values: {
      name: (r) => r.name,
      email: (r) => r.email,
      phone: (r) => r.phone,
      program: (r) => r.program,
      source: (r, { t }) => t(`adm.source.${r.source}`),
      sourceNote: (r) => r.sourceNote,
      status: (r, { t }) => t(`adm.leadStatus.${r.status}`),
      consent: (r) => r.consent,
      assignee: (r) => r.assignee,
      createdAt: (r) => r.createdAt,
    },
    cells: {
      name: (r) => (
        <Link href={`/adm/leads/${r.id}`} className="underline">
          {r.name}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge tone={TONE[r.status] ?? "neutral"} label={t(`adm.leadStatus.${r.status}`)} />
      ),
    },
    async fetch(params) {
      const f = params.filters;
      const and: Prisma.LeadWhereInput[] = [];
      if (f.name)
        and.push({
          OR: [
            { firstName: { contains: f.name, mode: "insensitive" } },
            { lastName: { contains: f.name, mode: "insensitive" } },
          ],
        });
      if (f.email) and.push({ email: { contains: f.email, mode: "insensitive" } });
      if (f.status) and.push({ status: f.status as never });
      if (f.source) and.push({ source: f.source as never });
      if (f.program) and.push({ program: { code: { contains: f.program.toUpperCase() } } });
      const where: Prisma.LeadWhereInput = and.length > 0 ? { AND: and } : {};
      const dir = params.sort.dir;
      const orderBy: Prisma.LeadOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ lastName: dir }, { firstName: dir }, { id: "asc" }]
          : params.sort.key === "status"
            ? [{ status: dir }, { createdAt: "desc" }, { id: "asc" }]
            : [{ createdAt: dir }, { id: "asc" }];
      const [total, leads] = await Promise.all([
        db.lead.count({ where }),
        db.lead.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: { program: { select: { code: true } } },
        }),
      ]);
      const assigneeIds = [...new Set(leads.flatMap((l) => (l.assigneeId ? [l.assigneeId] : [])))];
      const users = await db.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      });
      const names = new Map(users.map((u) => [u.id, u.name]));
      return {
        total,
        rows: leads.map((l) => ({
          id: l.id,
          name: `${l.lastName} ${l.firstName}`,
          email: l.email ?? "",
          phone: l.phone ?? "",
          program: l.program?.code ?? l.programNote ?? "",
          source: l.source,
          sourceNote: l.sourceNote ?? "",
          status: l.status,
          consent: l.consent,
          assignee: l.assigneeId ? (names.get(l.assigneeId) ?? "") : "",
          createdAt: l.createdAt,
        })),
      };
    },
  }),
);
