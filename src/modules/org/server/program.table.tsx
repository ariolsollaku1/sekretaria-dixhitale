import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";

type ProgramRow = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  cycle: "FIRST" | "SECOND";
  durationYears: number;
  totalCredits: number;
  department: string;
  active: boolean;
};

/** AC-10: study programs on the shared table framework. */
export const programsTable = registerTable(
  defineTable<ProgramRow>({
    id: "org.programs",
    permission: "org.program.read",
    exportName: "programs",
    rowKey: (r) => r.id,
    columns: [
      { key: "code", labelKey: "org.unit.code", type: "text", sortable: true, alwaysVisible: true },
      { key: "name", labelKey: "org.unit.name", type: "text", sortable: true },
      { key: "nameEn", labelKey: "org.unit.nameEn", type: "text", defaultVisible: false },
      { key: "cycle", labelKey: "org.program.cycle", type: "text", sortable: true },
      { key: "durationYears", labelKey: "org.program.duration", type: "number", sortable: true },
      { key: "totalCredits", labelKey: "org.program.credits", type: "number", sortable: true },
      { key: "department", labelKey: "org.unit.department", type: "text", sortable: true },
      { key: "status", labelKey: "org.columns.status", type: "text" },
    ],
    filters: [
      { key: "q", labelKey: "org.unit.search", type: "text" },
      {
        key: "cycle",
        labelKey: "org.program.cycle",
        type: "select",
        options: [
          { value: "FIRST", labelKey: "org.program.cycles.FIRST" },
          { value: "SECOND", labelKey: "org.program.cycles.SECOND" },
        ],
      },
      { key: "department", labelKey: "org.unit.departmentCode", type: "text" },
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
      cycle: (r, { t }) => t(`org.program.cycles.${r.cycle}`),
      durationYears: (r) => r.durationYears,
      totalCredits: (r) => r.totalCredits,
      department: (r) => r.department,
      status: (r, { t }) => t(r.active ? "org.unit.active" : "org.unit.inactive"),
    },
    cells: {
      code: (r) => (
        <Link href={`/org/programs/${r.id}`} className="font-tabular underline">
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
      const f = params.filters;
      const where: Prisma.StudyProgramWhereInput = {};
      if (f.q)
        where.OR = [
          { code: { contains: f.q, mode: "insensitive" } },
          { name: { contains: f.q, mode: "insensitive" } },
          { nameEn: { contains: f.q, mode: "insensitive" } },
        ];
      if (f.cycle) where.cycle = f.cycle as "FIRST" | "SECOND";
      if (f.department) where.department = { code: { contains: f.department.toUpperCase() } };
      if (f.status) where.active = f.status === "active";
      const dir = params.sort.dir;
      const order: Prisma.StudyProgramOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ name: dir }]
          : params.sort.key === "cycle"
            ? [{ cycle: dir }, { code: "asc" }]
            : params.sort.key === "durationYears"
              ? [{ durationYears: dir }, { code: "asc" }]
              : params.sort.key === "totalCredits"
                ? [{ totalCredits: dir }, { code: "asc" }]
                : params.sort.key === "department"
                  ? [{ department: { code: dir } }, { code: "asc" }]
                  : [{ code: dir }];
      const [total, rows] = await Promise.all([
        db.studyProgram.count({ where }),
        db.studyProgram.findMany({
          where,
          orderBy: order,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          select: {
            id: true,
            code: true,
            name: true,
            nameEn: true,
            cycle: true,
            durationYears: true,
            totalCredits: true,
            active: true,
            department: { select: { code: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map(({ department, ...r }) => ({ ...r, department: department.code })),
      };
    },
  }),
);
