import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { programScope } from "./cohort.queries";

type CohortRow = {
  id: string;
  program: string;
  startYear: string;
  name: string;
  plan: string;
  groups: number;
  active: boolean;
};

/** AC-11: cohorts within the reader's program scope. */
export const cohortsTable = registerTable(
  defineTable<CohortRow>({
    id: "org.cohorts",
    permission: "org.cohort.read",
    exportName: "cohorts",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "program",
        labelKey: "org.cohort.columns.program",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "startYear", labelKey: "org.cohort.columns.startYear", type: "text" },
      { key: "name", labelKey: "org.cohort.columns.name", type: "text", sortable: true },
      { key: "plan", labelKey: "org.cohort.columns.plan", type: "text" },
      { key: "groups", labelKey: "org.cohort.columns.groups", type: "number" },
      { key: "status", labelKey: "org.cohort.columns.status", type: "text" },
    ],
    filters: [
      { key: "program", labelKey: "org.cohort.columns.programCode", type: "text" },
      {
        key: "status",
        labelKey: "org.cohort.columns.status",
        type: "select",
        options: [
          { value: "active", labelKey: "org.status.active" },
          { value: "inactive", labelKey: "org.status.inactive" },
        ],
      },
    ],
    defaultSort: { key: "program", dir: "asc" },
    values: {
      program: (r) => r.program,
      startYear: (r) => r.startYear,
      name: (r) => r.name,
      plan: (r) => r.plan,
      groups: (r) => r.groups,
      status: (r, { t }) => t(r.active ? "org.status.active" : "org.status.inactive"),
    },
    cells: {
      program: (r) => (
        <Link href={`/org/cohorts/${r.id}`} className="underline">
          {r.program}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge
          tone={r.active ? "success" : "neutral"}
          label={t(r.active ? "org.status.active" : "org.status.inactive")}
        />
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const and: Prisma.CohortWhereInput[] = [
        { program: await programScope(user, "org.cohort.read") },
      ];
      if (f.program) and.push({ program: { code: { contains: f.program.toUpperCase() } } });
      if (f.status) and.push({ active: f.status === "active" });
      const where: Prisma.CohortWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.CohortOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ name: dir }]
          : [{ program: { code: dir } }, { startYear: { startDate: "desc" } }, { name: "asc" }];
      const [total, rows] = await Promise.all([
        db.cohort.count({ where }),
        db.cohort.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            program: { select: { code: true } },
            startYear: { select: { code: true } },
            plan: { select: { version: true } },
            _count: { select: { groups: { where: { active: true } } } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((c) => ({
          id: c.id,
          program: c.program.code,
          startYear: c.startYear.code,
          name: c.name,
          plan: `v${c.plan.version}`,
          groups: c._count.groups,
          active: c.active,
        })),
      };
    },
  }),
);
