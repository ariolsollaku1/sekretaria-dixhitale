import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { zonedDay } from "@/lib/i18n/zone";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { displayMoney } from "../domain/money";
import { finProgramScope, money, toDay } from "./fee.queries";

type Row = {
  id: string;
  studentNumber: string;
  name: string;
  program: string;
  sequence: number;
  dueDate: string;
  outstanding: string;
  kind: "UPCOMING" | "OVERDUE";
  outcome: "SENT" | "NO_ACCOUNT";
  sentOn: string;
  planId: string;
};

/**
 * FIN-04 AC-6: the log of payment reminders (SRC-086), newest first, within the reader's programs.
 * Shows who was reminded about which installment and when; no contact data.
 */
export const remindersTable = registerTable(
  defineTable<Row>({
    id: "fin.reminders",
    permission: "fin.payment.read",
    exportName: "payment-reminders",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "sentOn",
        labelKey: "fin.reminders.columns.sentOn",
        type: "date",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "studentNumber", labelKey: "fin.columns.studentNumber", type: "text", sortable: true },
      { key: "name", labelKey: "fin.columns.name", type: "text" },
      { key: "program", labelKey: "fin.columns.program", type: "text" },
      { key: "sequence", labelKey: "fin.reminders.columns.installment", type: "number" },
      { key: "dueDate", labelKey: "fin.reminders.columns.dueDate", type: "date", sortable: true },
      { key: "outstanding", labelKey: "fin.columns.outstanding", type: "text" },
      { key: "kind", labelKey: "fin.reminders.columns.kind", type: "text" },
      { key: "outcome", labelKey: "fin.reminders.columns.outcome", type: "text" },
    ],
    filters: [
      { key: "studentNumber", labelKey: "fin.columns.studentNumber", type: "text" },
      { key: "program", labelKey: "fin.columns.programCode", type: "text" },
      {
        key: "kind",
        labelKey: "fin.reminders.columns.kind",
        type: "select",
        options: [
          { value: "UPCOMING", labelKey: "fin.reminders.kind.UPCOMING" },
          { value: "OVERDUE", labelKey: "fin.reminders.kind.OVERDUE" },
        ],
      },
      {
        key: "outcome",
        labelKey: "fin.reminders.columns.outcome",
        type: "select",
        options: [
          { value: "SENT", labelKey: "fin.reminders.outcome.SENT" },
          { value: "NO_ACCOUNT", labelKey: "fin.reminders.outcome.NO_ACCOUNT" },
        ],
      },
    ],
    defaultSort: { key: "sentOn", dir: "desc" },
    values: {
      sentOn: (r) => r.sentOn,
      studentNumber: (r) => r.studentNumber,
      name: (r) => r.name,
      program: (r) => r.program,
      sequence: (r) => r.sequence,
      dueDate: (r) => r.dueDate,
      outstanding: (r) => r.outstanding,
      kind: (r, { t }) => t(`fin.reminders.kind.${r.kind}`),
      outcome: (r, { t }) => t(`fin.reminders.outcome.${r.outcome}`),
    },
    cells: {
      studentNumber: (r) => (
        <Link href={`/fin/plans/${r.planId}`} className="font-tabular underline">
          {r.studentNumber}
        </Link>
      ),
      outstanding: (r) => <span className="font-tabular">{displayMoney(r.outstanding)}</span>,
      outcome: (r, { t }) => (
        <StatusBadge
          tone={r.outcome === "SENT" ? "success" : "warning"}
          label={t(`fin.reminders.outcome.${r.outcome}`)}
        />
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const and: Prisma.PaymentReminderWhereInput[] = [
        {
          installment: {
            plan: { enrollment: { program: await finProgramScope(user, "fin.payment.read") } },
          },
        },
      ];
      if (f.studentNumber) and.push({ student: { studentNumber: { contains: f.studentNumber } } });
      if (f.program)
        and.push({
          installment: {
            plan: { enrollment: { program: { code: { contains: f.program.toUpperCase() } } } },
          },
        });
      if (f.kind === "UPCOMING" || f.kind === "OVERDUE") and.push({ kind: f.kind });
      if (f.outcome === "SENT" || f.outcome === "NO_ACCOUNT") and.push({ outcome: f.outcome });
      const where: Prisma.PaymentReminderWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.PaymentReminderOrderByWithRelationInput[] =
        params.sort.key === "studentNumber"
          ? [{ student: { studentNumber: dir } }, { id: "asc" }]
          : params.sort.key === "dueDate"
            ? [{ dueDate: dir }, { id: "asc" }]
            : [{ createdAt: dir }, { id: "asc" }];
      const [total, rows] = await Promise.all([
        db.paymentReminder.count({ where }),
        db.paymentReminder.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            student: {
              select: {
                studentNumber: true,
                person: { select: { firstName: true, lastName: true } },
              },
            },
            installment: {
              select: {
                sequence: true,
                planId: true,
                plan: {
                  select: { enrollment: { select: { program: { select: { code: true } } } } },
                },
              },
            },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r): Row => ({
          id: r.id,
          studentNumber: r.student.studentNumber,
          name: `${r.student.person.lastName} ${r.student.person.firstName}`,
          program: r.installment.plan.enrollment.program.code,
          sequence: r.installment.sequence,
          dueDate: toDay(r.dueDate),
          outstanding: money(r.outstanding),
          kind: r.kind,
          outcome: r.outcome,
          sentOn: zonedDay(r.createdAt),
          planId: r.installment.planId,
        })),
      };
    },
  }),
);
