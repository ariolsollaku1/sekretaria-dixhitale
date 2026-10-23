import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { toDay } from "./year.queries";

type YearRow = {
  id: string;
  code: string;
  status: "PLANNED" | "CURRENT" | "CLOSED";
  startDate: string;
  endDate: string;
  semesters: string;
};

const TONE: Record<YearRow["status"], StatusTone> = {
  CURRENT: "success",
  PLANNED: "info",
  CLOSED: "neutral",
};

/** AC-10: the list of academic years on the shared table framework. */
export const yearsTable = registerTable(
  defineTable<YearRow>({
    id: "org.years",
    permission: "org.year.read",
    exportName: "academic-years",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "code",
        labelKey: "org.columns.code",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "startDate", labelKey: "org.columns.start", type: "date", sortable: true },
      { key: "endDate", labelKey: "org.columns.end", type: "date", sortable: true },
      { key: "status", labelKey: "org.columns.status", type: "text", sortable: true },
      { key: "semesters", labelKey: "org.columns.semesters", type: "text", defaultVisible: false },
    ],
    filters: [
      {
        key: "status",
        labelKey: "org.columns.status",
        type: "select",
        options: [
          { value: "PLANNED", labelKey: "org.status.PLANNED" },
          { value: "CURRENT", labelKey: "org.status.CURRENT" },
          { value: "CLOSED", labelKey: "org.status.CLOSED" },
        ],
      },
    ],
    defaultSort: { key: "startDate", dir: "desc" },
    values: {
      code: (r) => r.code,
      startDate: (r) => r.startDate,
      endDate: (r) => r.endDate,
      status: (r, { t }) => t(`org.status.${r.status}`),
      semesters: (r) => r.semesters,
    },
    cells: {
      code: (r) => (
        <Link href={`/org/years/${r.id}`} className="font-tabular underline">
          {r.code}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge tone={TONE[r.status]} label={t(`org.status.${r.status}`)} />
      ),
    },
    async fetch(params) {
      const where: Prisma.AcademicYearWhereInput = {};
      if (params.filters.status) where.status = params.filters.status as YearRow["status"];
      const dir = params.sort.dir;
      const orderBy: Prisma.AcademicYearOrderByWithRelationInput[] =
        params.sort.key === "code"
          ? [{ code: dir }]
          : params.sort.key === "status"
            ? [{ status: dir }, { startDate: "desc" }]
            : params.sort.key === "endDate"
              ? [{ endDate: dir }]
              : [{ startDate: dir }];
      const [total, rows] = await Promise.all([
        db.academicYear.count({ where }),
        db.academicYear.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: { semesters: { orderBy: { number: "asc" } } },
        }),
      ]);
      return {
        total,
        rows: rows.map((y) => ({
          id: y.id,
          code: y.code,
          status: y.status,
          startDate: toDay(y.startDate),
          endDate: toDay(y.endDate),
          semesters: y.semesters
            .map((s) => `${s.number}: ${toDay(s.startDate)} – ${toDay(s.endDate)}`)
            .join("; "),
        })),
      };
    },
  }),
);
