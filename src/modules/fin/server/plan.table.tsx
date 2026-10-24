import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { StatusBadge } from "@/components/ui/status-badge";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { planTotals } from "../domain/fee-rules";
import { centsOf, displayMoney, formatCents } from "../domain/money";
import { dayInTirane, owedOn, planBalance } from "../domain/payment-rules";
import { finProgramScope, toDay } from "./fee.queries";

type Row = {
  id: string;
  studentNumber: string;
  name: string;
  program: string;
  year: string;
  installments: number;
  total: string;
  nextDue: string;
  /** FIN-02 AC-9: empty without `fin.payment.read`. */
  paid: string;
  outstanding: string;
  clearance: "CLEARED" | "NOT_CLEARED" | "";
};

/** AC-10: payment plans of the selected academic year within the reader's programs. */
export const plansTable = registerTable(
  defineTable<Row>({
    id: "fin.plans",
    permission: "fin.plan.read",
    exportName: "payment-plans",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "studentNumber",
        labelKey: "fin.columns.studentNumber",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "name", labelKey: "fin.columns.name", type: "text", sortable: true },
      { key: "program", labelKey: "fin.columns.program", type: "text", sortable: true },
      { key: "year", labelKey: "fin.columns.year", type: "text" },
      { key: "installments", labelKey: "fin.columns.installments", type: "number" },
      { key: "total", labelKey: "fin.columns.total", type: "text" },
      { key: "nextDue", labelKey: "fin.columns.nextDue", type: "text" },
      { key: "paid", labelKey: "fin.columns.paid", type: "text" },
      { key: "outstanding", labelKey: "fin.columns.outstanding", type: "text" },
      { key: "clearance", labelKey: "fin.columns.clearance", type: "text" },
    ],
    filters: [
      { key: "studentNumber", labelKey: "fin.columns.studentNumber", type: "text" },
      { key: "name", labelKey: "fin.columns.name", type: "text" },
      { key: "program", labelKey: "fin.columns.programCode", type: "text" },
    ],
    defaultSort: { key: "studentNumber", dir: "asc" },
    values: {
      studentNumber: (r) => r.studentNumber,
      name: (r) => r.name,
      program: (r) => r.program,
      year: (r) => r.year,
      installments: (r) => r.installments,
      total: (r) => r.total,
      nextDue: (r) => r.nextDue,
      paid: (r) => r.paid,
      outstanding: (r) => r.outstanding,
      clearance: (r, { t }) => (r.clearance ? t(`fin.clearance.${r.clearance}`) : ""),
    },
    cells: {
      studentNumber: (r) => (
        <Link href={`/fin/plans/${r.id}`} className="font-tabular underline">
          {r.studentNumber}
        </Link>
      ),
      total: (r) => <span className="font-tabular">{displayMoney(r.total)}</span>,
      paid: (r) => (r.paid ? <span className="font-tabular">{displayMoney(r.paid)}</span> : null),
      outstanding: (r) =>
        r.outstanding ? <span className="font-tabular">{displayMoney(r.outstanding)}</span> : null,
      clearance: (r, { t }) =>
        r.clearance ? (
          <StatusBadge
            tone={r.clearance === "CLEARED" ? "success" : "danger"}
            label={t(`fin.clearance.${r.clearance}`)}
          />
        ) : null,
    },
    async fetch(params, { user }) {
      const yearId = await getSelectedAcademicYear();
      if (!yearId) return { total: 0, rows: [] };
      const f = params.filters;
      const and: Prisma.PaymentPlanWhereInput[] = [
        {
          academicYearId: yearId,
          enrollment: { program: await finProgramScope(user, "fin.plan.read") },
        },
      ];
      if (f.studentNumber)
        and.push({ enrollment: { student: { studentNumber: { contains: f.studentNumber } } } });
      if (f.name)
        and.push({
          enrollment: {
            student: {
              person: {
                OR: [
                  { firstName: { contains: f.name, mode: "insensitive" } },
                  { lastName: { contains: f.name, mode: "insensitive" } },
                ],
              },
            },
          },
        });
      if (f.program)
        and.push({ enrollment: { program: { code: { contains: f.program.toUpperCase() } } } });
      const where: Prisma.PaymentPlanWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.PaymentPlanOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ enrollment: { student: { person: { lastName: dir } } } }]
          : params.sort.key === "program"
            ? [{ enrollment: { program: { code: dir } } }, { id: "asc" }]
            : [{ enrollment: { student: { studentNumber: dir } } }, { id: "asc" }];
      const [total, plans] = await Promise.all([
        db.paymentPlan.count({ where }),
        db.paymentPlan.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            academicYear: { select: { code: true } },
            installments: {
              select: {
                id: true,
                sequence: true,
                status: true,
                amount: true,
                earlyAmount: true,
                earlyUntil: true,
                dueDate: true,
              },
            },
            payments: {
              where: { status: "RECORDED" },
              select: {
                id: true,
                paidOn: true,
                amount: true,
                installmentId: true,
                createdAt: true,
              },
            },
            enrollment: {
              select: {
                program: { select: { code: true } },
                student: {
                  select: {
                    studentNumber: true,
                    person: { select: { firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        }),
      ]);
      const mayReadPayments = await can(user, "fin.payment.read");
      const today = dayInTirane();
      return {
        total,
        rows: plans.map((p) => {
          const active = p.installments.filter((i) => i.status === "ACTIVE");
          const totals = planTotals(
            active.map((i) => ({
              status: i.status,
              amountCents: centsOf(i.amount),
              earlyCents: null,
            })),
          );
          const next = active.map((i) => toDay(i.dueDate)).sort()[0] ?? "";
          let paid = "";
          let outstanding = "";
          let clearance: Row["clearance"] = "";
          if (mayReadPayments) {
            const inputs = active.map((i) => ({
              id: i.id,
              sequence: i.sequence,
              dueDate: toDay(i.dueDate),
              amountCents: centsOf(i.amount),
              earlyCents: i.earlyAmount ? centsOf(i.earlyAmount) : null,
              earlyUntil: i.earlyUntil ? toDay(i.earlyUntil) : null,
            }));
            const b = planBalance(
              inputs,
              [...p.payments]
                .sort((a, c) => a.createdAt.getTime() - c.createdAt.getTime())
                .map((x, order) => ({
                  id: x.id,
                  paidOn: toDay(x.paidOn),
                  amountCents: centsOf(x.amount),
                  installmentId: x.installmentId,
                  order,
                })),
              today,
            );
            paid = formatCents(b.paidCents);
            outstanding = formatCents(b.outstandingCents);
            clearance = owedOn(inputs, b, today) === 0 ? "CLEARED" : "NOT_CLEARED";
          }
          return {
            id: p.id,
            studentNumber: p.enrollment.student.studentNumber,
            name: `${p.enrollment.student.person.lastName} ${p.enrollment.student.person.firstName}`,
            program: p.enrollment.program.code,
            year: p.academicYear.code,
            installments: totals.count,
            total: formatCents(totals.totalCents),
            nextDue: next,
            paid,
            outstanding,
            clearance,
          };
        }),
      };
    },
  }),
);
