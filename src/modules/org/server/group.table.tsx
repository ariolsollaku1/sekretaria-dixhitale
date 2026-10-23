import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { programScope } from "./cohort.queries";

type GroupRow = {
  id: string;
  cohortId: string;
  program: string;
  cohort: string;
  year: string;
  yearOfStudy: number;
  name: string;
  capacity: number | null;
  active: boolean;
};

/** AC-11: groups across cohorts within the reader's program scope. */
export const groupsTable = registerTable(
  defineTable<GroupRow>({
    id: "org.groups",
    permission: "org.group.read",
    exportName: "student-groups",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "program",
        labelKey: "org.group.columns.program",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "cohort", labelKey: "org.group.columns.cohort", type: "text" },
      { key: "year", labelKey: "org.group.columns.year", type: "text" },
      {
        key: "yearOfStudy",
        labelKey: "org.group.columns.yearOfStudy",
        type: "number",
        sortable: true,
      },
      { key: "name", labelKey: "org.group.columns.name", type: "text", sortable: true },
      { key: "capacity", labelKey: "org.group.columns.capacity", type: "number" },
      { key: "status", labelKey: "org.group.columns.status", type: "text" },
    ],
    filters: [
      { key: "program", labelKey: "org.group.columns.programCode", type: "text" },
      { key: "year", labelKey: "org.group.columns.yearCode", type: "text" },
      {
        key: "status",
        labelKey: "org.group.columns.status",
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
      cohort: (r) => r.cohort,
      year: (r) => r.year,
      yearOfStudy: (r) => r.yearOfStudy,
      name: (r) => r.name,
      capacity: (r) => r.capacity,
      status: (r, { t }) => t(r.active ? "org.status.active" : "org.status.inactive"),
    },
    cells: {
      program: (r) => (
        <Link href={`/org/cohorts/${r.cohortId}`} className="underline">
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
      const and: Prisma.StudentGroupWhereInput[] = [
        { cohort: { program: await programScope(user, "org.group.read") } },
      ];
      if (f.program)
        and.push({ cohort: { program: { code: { contains: f.program.toUpperCase() } } } });
      if (f.year) and.push({ academicYear: { code: { contains: f.year } } });
      if (f.status) and.push({ active: f.status === "active" });
      const where: Prisma.StudentGroupWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.StudentGroupOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ name: dir }]
          : params.sort.key === "yearOfStudy"
            ? [{ yearOfStudy: dir }, { name: "asc" }]
            : [
                { cohort: { program: { code: dir } } },
                { academicYear: { startDate: "desc" } },
                { yearOfStudy: "asc" },
                { name: "asc" },
              ];
      const [total, rows] = await Promise.all([
        db.studentGroup.count({ where }),
        db.studentGroup.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            academicYear: { select: { code: true } },
            cohort: { select: { id: true, name: true, program: { select: { code: true } } } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((g) => ({
          id: g.id,
          cohortId: g.cohort.id,
          program: g.cohort.program.code,
          cohort: g.cohort.name,
          year: g.academicYear.code,
          yearOfStudy: g.yearOfStudy,
          name: g.name,
          capacity: g.capacity,
          active: g.active,
        })),
      };
    },
  }),
);
