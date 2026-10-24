import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../evaluation-permissions";
import { evaluationScopeWhere } from "./evaluation.queries";

type Row = {
  id: string;
  campaignId: string;
  campaign: string;
  name: string;
  department: string;
  evaluator: string;
  state: "PENDING" | "SUBMITTED";
  score: number | null;
};

/**
 * AC-8: evaluations inside the reader's scope. Answers are never part of the table; the score is
 * (it is what the reports are built from).
 */
export const evaluationsTable = registerTable(
  defineTable<Row>({
    id: "hr.evaluations",
    permission: "hr.evaluation.read",
    exportName: "evaluations",
    rowKey: (r) => r.id,
    columns: [
      { key: "campaign", labelKey: "hrEvaluation.columns.campaign", type: "text", sortable: true },
      {
        key: "name",
        labelKey: "hrEvaluation.columns.person",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "department", labelKey: "hrEvaluation.columns.department", type: "text" },
      { key: "evaluator", labelKey: "hrEvaluation.columns.evaluator", type: "text" },
      { key: "state", labelKey: "hrEvaluation.columns.state", type: "text", sortable: true },
      { key: "score", labelKey: "hrEvaluation.columns.score", type: "number", sortable: true },
    ],
    filters: [
      { key: "campaign", labelKey: "hrEvaluation.columns.campaign", type: "text" },
      {
        key: "state",
        labelKey: "hrEvaluation.columns.state",
        type: "select",
        options: [
          { value: "PENDING", labelKey: "hrEvaluation.states.PENDING" },
          { value: "SUBMITTED", labelKey: "hrEvaluation.states.SUBMITTED" },
        ],
      },
      { key: "department", labelKey: "hrEvaluation.columns.departmentCode", type: "text" },
    ],
    defaultSort: { key: "name", dir: "asc" },
    values: {
      campaign: (r) => r.campaign,
      name: (r) => r.name,
      department: (r) => r.department,
      evaluator: (r) => r.evaluator,
      state: (r, { t }) => t(`hrEvaluation.states.${r.state}`),
      score: (r) => r.score,
    },
    cells: {
      campaign: (r) => (
        <Link href={`/hr/evaluations/${r.campaignId}`} className="underline">
          {r.campaign}
        </Link>
      ),
      state: (r, { t }) => (
        <StatusBadge
          tone={r.state === "SUBMITTED" ? "success" : "neutral"}
          label={t(`hrEvaluation.states.${r.state}`)}
        />
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const and: Prisma.EvaluationWhereInput[] = [await evaluationScopeWhere(user)];
      if (f.campaign)
        and.push({ campaign: { name: { contains: f.campaign, mode: "insensitive" } } });
      if (f.state) and.push({ state: f.state as never });
      if (f.department)
        and.push({
          staff: { department: { code: { contains: f.department.toUpperCase() } } },
        });
      const where: Prisma.EvaluationWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.EvaluationOrderByWithRelationInput[] =
        params.sort.key === "campaign"
          ? [{ campaign: { name: dir } }]
          : params.sort.key === "state"
            ? [{ state: dir }]
            : params.sort.key === "score"
              ? [{ score: { sort: dir, nulls: "last" } }]
              : [
                  { staff: { person: { lastName: dir } } },
                  { staff: { person: { firstName: dir } } },
                ];
      const [total, rows] = await Promise.all([
        db.evaluation.count({ where }),
        db.evaluation.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            campaign: { select: { id: true, name: true } },
            evaluator: { select: { name: true } },
            staff: {
              select: {
                person: { select: { firstName: true, lastName: true } },
                department: { select: { code: true } },
              },
            },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r) => ({
          id: r.id,
          campaignId: r.campaign.id,
          campaign: r.campaign.name,
          name: `${r.staff.person.lastName} ${r.staff.person.firstName}`,
          department: r.staff.department?.code ?? "",
          evaluator: r.evaluator?.name ?? "",
          state: r.state,
          score: r.score === null ? null : Number(r.score),
        })),
      };
    },
  }),
);
