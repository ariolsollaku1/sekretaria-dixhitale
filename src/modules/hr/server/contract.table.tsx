import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { CATEGORIES, KINDS } from "../domain/schemas";
import { classifyContract, daysLeft, type ContractState } from "../domain/contract-rules";
import { getHorizonDays, today } from "./contract.queries";
import { scopeWhere, toDay } from "./staff.queries";

type Row = {
  id: string;
  name: string;
  kind: string;
  category: string;
  department: string;
  contractEnd: string;
  daysLeft: number;
  state: ContractState;
};

const TONE: Record<ContractState, StatusTone> = {
  ENDED: "danger",
  ENDING_SOON: "warning",
  OK: "neutral",
};

const addDays = (day: string, n: number) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * AC-2/AC-3: employed staff with a contract end date. By default only ended and ending-soon
 * contracts of academic staff; the filters widen or narrow that. Only fields that carry no
 * personal identifiers.
 */
export const contractsTable = registerTable(
  defineTable<Row>({
    id: "hr.contracts",
    permission: "hr.staff.read",
    exportName: "contracts",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "name",
        labelKey: "hr.columns.name",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "kind", labelKey: "hr.columns.kind", type: "text" },
      { key: "category", labelKey: "hr.columns.category", type: "text" },
      { key: "department", labelKey: "hr.columns.department", type: "text" },
      { key: "contractEnd", labelKey: "hr.columns.contractEnd", type: "date", sortable: true },
      { key: "daysLeft", labelKey: "hr.contracts.daysLeft", type: "number" },
      { key: "state", labelKey: "hr.contracts.state", type: "text" },
    ],
    filters: [
      {
        key: "state",
        labelKey: "hr.contracts.state",
        type: "select",
        options: [
          { value: "ended", labelKey: "hr.contracts.states.ENDED" },
          { value: "soon", labelKey: "hr.contracts.states.ENDING_SOON" },
          { value: "all", labelKey: "hr.contracts.states.all" },
        ],
      },
      {
        key: "kind",
        labelKey: "hr.columns.kind",
        type: "select",
        options: [
          ...KINDS.map((v) => ({ value: v, labelKey: `hr.kind.${v}` })),
          { value: "ALL", labelKey: "hr.contracts.states.all" },
        ],
      },
      {
        key: "category",
        labelKey: "hr.columns.category",
        type: "select",
        options: CATEGORIES.map((v) => ({ value: v, labelKey: `hr.category.${v}` })),
      },
      { key: "department", labelKey: "hr.columns.departmentCode", type: "text" },
    ],
    defaultSort: { key: "contractEnd", dir: "asc" },
    values: {
      name: (r) => r.name,
      kind: (r, { t }) => t(`hr.kind.${r.kind}`),
      category: (r, { t }) => t(`hr.category.${r.category}`),
      department: (r) => r.department,
      contractEnd: (r) => r.contractEnd,
      daysLeft: (r) => r.daysLeft,
      state: (r, { t }) => t(`hr.contracts.states.${r.state}`),
    },
    cells: {
      name: (r) => (
        <Link href={`/hr/staff/${r.id}`} className="underline">
          {r.name}
        </Link>
      ),
      state: (r, { t }) => (
        <StatusBadge tone={TONE[r.state]} label={t(`hr.contracts.states.${r.state}`)} />
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const day = today();
      const horizon = await getHorizonDays();
      const limit = addDays(day, horizon);
      const and: Prisma.StaffWhereInput[] = [
        await scopeWhere(user),
        { active: true, contractEnd: { not: null } },
      ];
      if ((f.kind ?? "ACADEMIC") !== "ALL") and.push({ kind: (f.kind ?? "ACADEMIC") as never });
      if (f.category) and.push({ category: f.category as never });
      if (f.department)
        and.push({ department: { code: { contains: f.department.toUpperCase() } } });
      const endWhere: Prisma.DateTimeNullableFilter =
        f.state === "ended"
          ? { lt: new Date(`${day}T00:00:00Z`) }
          : f.state === "soon"
            ? { gte: new Date(`${day}T00:00:00Z`), lte: new Date(`${limit}T00:00:00Z`) }
            : f.state === "all"
              ? {}
              : { lte: new Date(`${limit}T00:00:00Z`) }; // default: ended or ending soon
      and.push({ contractEnd: endWhere });
      const where: Prisma.StaffWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.StaffOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ person: { lastName: dir } }, { person: { firstName: dir } }]
          : [{ contractEnd: dir }, { person: { lastName: "asc" } }];
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
        rows: rows.map((s) => {
          const end = toDay(s.contractEnd!);
          return {
            id: s.id,
            name: `${s.person.lastName} ${s.person.firstName}`,
            kind: s.kind,
            category: s.category,
            department: s.department?.code ?? "",
            contractEnd: end,
            daysLeft: daysLeft(end, day),
            state: classifyContract({
              active: s.active,
              contractEnd: end,
              today: day,
              horizonDays: horizon,
            }),
          };
        }),
      };
    },
  }),
);
