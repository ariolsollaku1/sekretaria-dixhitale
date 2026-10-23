import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { planWhere, toDay } from "./plan.queries";

type Row = {
  id: string;
  program: string;
  version: number;
  validFrom: string;
  status: "DRAFT" | "APPROVED" | "ARCHIVED";
  courses: number;
  credits: number;
  approvedOn: string;
};

const TONE: Record<Row["status"], StatusTone> = {
  DRAFT: "neutral",
  APPROVED: "success",
  ARCHIVED: "warning",
};

/** AC-10: plans within the user's scope. */
export const plansTable = registerTable(
  defineTable<Row>({
    id: "cur.plans",
    permission: "cur.plan.view",
    exportName: "curriculum-plans",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "program",
        labelKey: "cur.plan.columns.program",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "version", labelKey: "cur.plan.columns.version", type: "number", sortable: true },
      { key: "validFrom", labelKey: "cur.plan.columns.validFrom", type: "text" },
      { key: "status", labelKey: "cur.plan.columns.status", type: "text", sortable: true },
      { key: "courses", labelKey: "cur.plan.columns.courses", type: "number" },
      { key: "credits", labelKey: "cur.plan.columns.credits", type: "number" },
      { key: "approvedOn", labelKey: "cur.plan.columns.approvedOn", type: "date" },
    ],
    filters: [
      { key: "program", labelKey: "cur.plan.columns.programCode", type: "text" },
      {
        key: "status",
        labelKey: "cur.plan.columns.status",
        type: "select",
        options: ["DRAFT", "APPROVED", "ARCHIVED"].map((v) => ({
          value: v,
          labelKey: `cur.plan.status.${v}`,
        })),
      },
    ],
    defaultSort: { key: "program", dir: "asc" },
    values: {
      program: (r) => r.program,
      version: (r) => r.version,
      validFrom: (r) => r.validFrom,
      status: (r, { t }) => t(`cur.plan.status.${r.status}`),
      courses: (r) => r.courses,
      credits: (r) => r.credits,
      approvedOn: (r) => r.approvedOn,
    },
    cells: {
      program: (r) => (
        <Link href={`/cur/plans/${r.id}`} className="underline">
          {r.program}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge tone={TONE[r.status]} label={t(`cur.plan.status.${r.status}`)} />
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const and: Prisma.CurriculumPlanWhereInput[] = [await planWhere(user)];
      if (f.program) and.push({ program: { code: { contains: f.program.toUpperCase() } } });
      if (f.status) and.push({ status: f.status as Row["status"] });
      const where: Prisma.CurriculumPlanWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.CurriculumPlanOrderByWithRelationInput[] =
        params.sort.key === "version"
          ? [{ version: dir }, { program: { code: "asc" } }]
          : params.sort.key === "status"
            ? [{ status: dir }, { program: { code: "asc" } }]
            : [{ program: { code: dir } }, { version: "desc" }];
      const [total, rows] = await Promise.all([
        db.curriculumPlan.count({ where }),
        db.curriculumPlan.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: { program: { select: { code: true } }, validFrom: { select: { code: true } } },
        }),
      ]);
      const sums = await db.planCourse.groupBy({
        by: ["planId"],
        where: { planId: { in: rows.map((r) => r.id) } },
        _sum: { credits: true },
        _count: { _all: true },
      });
      return {
        total,
        rows: rows.map((p) => {
          const s = sums.find((x) => x.planId === p.id);
          return {
            id: p.id,
            program: p.program.code,
            version: p.version,
            validFrom: p.validFrom.code,
            status: p.status,
            courses: s?._count._all ?? 0,
            credits: s?._sum.credits ?? 0,
            approvedOn: p.approvedAt ? toDay(p.approvedAt) : "",
          };
        }),
      };
    },
  }),
);
