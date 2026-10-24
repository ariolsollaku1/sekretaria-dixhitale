import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { StatusBadge } from "@/components/ui/status-badge";
import { defineTable, registerTable } from "@/lib/tables/define";
import { listSessions } from "@/modules/cal";
import "../permissions";
import { displayMoney, formatCents } from "../domain/money";
import { LIST_SESSION_TYPES, pageRows, sessionClearanceDate, sortRows } from "../domain/list-rules";
import { dayInTirane, planBalance, type InstallmentStatus } from "../domain/payment-rules";
import { finProgramScope } from "./fee.queries";
import { getFinancialClearances, toInstallment, toPayments } from "./payment.queries";

const STATUSES: InstallmentStatus[] = ["PAID", "PARTIAL", "UNPAID", "OVERDUE"];
const RESULTS = ["CLEARED", "NOT_CLEARED"] as const;

/** The student filters shared by both lists (the part SQL can do). */
function studentWhere(f: Record<string, string>): Prisma.EnrollmentWhereInput[] {
  const and: Prisma.EnrollmentWhereInput[] = [];
  if (f.studentNumber) and.push({ student: { studentNumber: { contains: f.studentNumber } } });
  if (f.name)
    and.push({
      student: {
        person: {
          OR: [
            { firstName: { contains: f.name, mode: "insensitive" } },
            { lastName: { contains: f.name, mode: "insensitive" } },
          ],
        },
      },
    });
  if (f.program) and.push({ program: { code: { contains: f.program.toUpperCase() } } });
  return and;
}

const enrollmentSelect = {
  program: { select: { code: true } },
  student: {
    select: {
      id: true,
      studentNumber: true,
      person: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
    },
  },
} as const;

/** Plans of the selected year within the reader's program scope and the student filters. */
async function scopedPlans(user: { id: string }, yearId: string, f: Record<string, string>) {
  return db.paymentPlan.findMany({
    where: {
      academicYearId: yearId,
      enrollment: {
        AND: [{ program: await finProgramScope(user, "fin.payment.read") }, ...studentWhere(f)],
      },
    },
    include: {
      enrollment: { select: enrollmentSelect },
      installments: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          sequence: true,
          kind: true,
          label: true,
          dueDate: true,
          amount: true,
          earlyAmount: true,
          earlyUntil: true,
        },
      },
      payments: {
        where: { status: "RECORDED" },
        select: { id: true, paidOn: true, amount: true, installmentId: true, createdAt: true },
      },
    },
  });
}

const textFilters = [
  { key: "studentNumber", labelKey: "fin.columns.studentNumber", type: "text" },
  { key: "name", labelKey: "fin.columns.name", type: "text" },
  { key: "program", labelKey: "fin.columns.programCode", type: "text" },
] as const;

// ---------------------------------------------------------------- deadlines (SRC-085)

type DeadlineRow = {
  id: string;
  planId: string;
  personId: string;
  dueDate: string;
  studentNumber: string;
  name: string;
  program: string;
  kind: string;
  label: string;
  amount: string;
  paid: string;
  outstanding: string;
  status: InstallmentStatus;
};

/**
 * SRC-085, SRC-087, AC-1: the installments of the selected academic year in due-date order with
 * paid / outstanding / status, within the reader's programs. Status is computed (FIN-02), so the
 * rows are filtered, sorted and paged in memory.
 */
export const deadlinesTable = registerTable(
  defineTable<DeadlineRow>({
    id: "fin.lists.deadlines",
    permission: "fin.payment.read",
    exportName: "payment-deadlines",
    rowKey: (r) => r.id,
    recipient: (r) => r.personId,
    columns: [
      { key: "dueDate", labelKey: "fin.lists.columns.dueDate", type: "date", sortable: true },
      {
        key: "studentNumber",
        labelKey: "fin.columns.studentNumber",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "name", labelKey: "fin.columns.name", type: "text", sortable: true },
      { key: "program", labelKey: "fin.columns.program", type: "text", sortable: true },
      { key: "label", labelKey: "fin.lists.columns.installment", type: "text" },
      { key: "amount", labelKey: "fin.lists.columns.amount", type: "text" },
      { key: "paid", labelKey: "fin.columns.paid", type: "text" },
      { key: "outstanding", labelKey: "fin.columns.outstanding", type: "text" },
      { key: "status", labelKey: "fin.lists.columns.status", type: "text", sortable: true },
    ],
    filters: [
      { key: "dueFrom", labelKey: "fin.lists.filters.dueFrom", type: "date" },
      { key: "dueTo", labelKey: "fin.lists.filters.dueTo", type: "date" },
      {
        key: "status",
        labelKey: "fin.lists.columns.status",
        type: "select",
        options: STATUSES.map((v) => ({ value: v, labelKey: `fin.payment.status.${v}` })),
      },
      ...textFilters,
    ],
    defaultSort: { key: "dueDate", dir: "asc" },
    values: {
      dueDate: (r) => r.dueDate,
      studentNumber: (r) => r.studentNumber,
      name: (r) => r.name,
      program: (r) => r.program,
      label: (r, { t }) =>
        r.label ? `${t(`fin.kind.${r.kind}`)} - ${r.label}` : t(`fin.kind.${r.kind}`),
      amount: (r) => r.amount,
      paid: (r) => r.paid,
      outstanding: (r) => r.outstanding,
      status: (r, { t }) => t(`fin.payment.status.${r.status}`),
    },
    cells: {
      studentNumber: (r) => (
        <Link href={`/fin/plans/${r.planId}`} className="font-tabular underline">
          {r.studentNumber}
        </Link>
      ),
      amount: (r) => <span className="font-tabular">{displayMoney(r.amount)}</span>,
      paid: (r) => <span className="font-tabular">{displayMoney(r.paid)}</span>,
      outstanding: (r) => <span className="font-tabular">{displayMoney(r.outstanding)}</span>,
      status: (r, { t }) => (
        <StatusBadge
          tone={r.status === "PAID" ? "success" : r.status === "OVERDUE" ? "danger" : "neutral"}
          label={t(`fin.payment.status.${r.status}`)}
        />
      ),
    },
    async fetch(params, { user }) {
      const yearId = await getSelectedAcademicYear();
      if (!yearId) return { total: 0, rows: [] };
      const f = params.filters;
      const today = dayInTirane();
      const plans = await scopedPlans(user, yearId, f);
      const all: DeadlineRow[] = [];
      for (const p of plans) {
        const b = planBalance(p.installments.map(toInstallment), toPayments(p.payments), today);
        const lines = new Map(b.installments.map((l) => [l.id, l]));
        const person = p.enrollment.student.person;
        for (const i of p.installments) {
          const l = lines.get(i.id)!;
          const dueDate = i.dueDate.toISOString().slice(0, 10);
          if (f.dueFrom && dueDate < f.dueFrom) continue;
          if (f.dueTo && dueDate > f.dueTo) continue;
          if (f.status && l.status !== f.status) continue;
          all.push({
            id: i.id,
            planId: p.id,
            personId: person.id,
            dueDate,
            studentNumber: p.enrollment.student.studentNumber,
            name: `${person.lastName} ${person.firstName}`,
            program: p.enrollment.program.code,
            kind: i.kind,
            label: i.label,
            amount: i.amount.toFixed(2),
            paid: formatCents(l.paidCents),
            outstanding: formatCents(l.outstandingCents),
            status: l.status,
          });
        }
      }
      const key = params.sort.key;
      const sorted = sortRows(
        all,
        (r) => (key === "status" ? r.status : ((r as Record<string, string>)[key] ?? r.dueDate)),
        params.sort.dir,
        (r) => `${r.dueDate}${r.studentNumber}${r.id}`,
      );
      return { total: sorted.length, rows: pageRows(sorted, params.page, params.pageSize) };
    },
  }),
);

// ---------------------------------------------------------------- clearance / debtors (SRC-049)

type ClearanceRow = {
  id: string;
  planId: string;
  personId: string;
  studentNumber: string;
  name: string;
  program: string;
  email: string;
  phone: string;
  date: string;
  owed: string;
  owedCents: number;
  result: (typeof RESULTS)[number];
};

/**
 * SRC-049a/b, SRC-087, AC-2..AC-5: the students with a plan in the selected year who are / are not
 * financially cleared before an exam session (the day before it starts) or on a given date.
 * The debtors list is the same table filtered to NOT_CLEARED. Q-143.
 */
export const clearanceTable = registerTable(
  defineTable<ClearanceRow>({
    id: "fin.lists.clearance",
    permission: "fin.payment.read",
    exportName: "financial-clearance",
    rowKey: (r) => r.id,
    recipient: (r) => r.personId,
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
      { key: "email", labelKey: "fin.lists.columns.email", type: "text" },
      { key: "phone", labelKey: "fin.lists.columns.phone", type: "text" },
      { key: "date", labelKey: "fin.lists.columns.date", type: "date" },
      { key: "owed", labelKey: "fin.lists.columns.owed", type: "text", sortable: true },
      { key: "result", labelKey: "fin.columns.clearance", type: "text", sortable: true },
    ],
    filters: [
      {
        key: "result",
        labelKey: "fin.columns.clearance",
        type: "select",
        options: RESULTS.map((v) => ({ value: v, labelKey: `fin.clearance.${v}` })),
      },
      {
        key: "session",
        labelKey: "fin.lists.filters.session",
        type: "select",
        options: LIST_SESSION_TYPES.map((v) => ({ value: v, labelKey: `fin.lists.session.${v}` })),
      },
      { key: "asOf", labelKey: "fin.lists.filters.asOf", type: "date" },
      ...textFilters,
    ],
    defaultSort: { key: "studentNumber", dir: "asc" },
    values: {
      studentNumber: (r) => r.studentNumber,
      name: (r) => r.name,
      program: (r) => r.program,
      email: (r) => r.email,
      phone: (r) => r.phone,
      date: (r) => r.date,
      owed: (r) => r.owed,
      result: (r, { t }) => t(`fin.clearance.${r.result}`),
    },
    cells: {
      studentNumber: (r) => (
        <Link href={`/fin/plans/${r.planId}`} className="font-tabular underline">
          {r.studentNumber}
        </Link>
      ),
      owed: (r) => <span className="font-tabular">{displayMoney(r.owed)}</span>,
      result: (r, { t }) => (
        <StatusBadge
          tone={r.result === "CLEARED" ? "success" : "danger"}
          label={t(`fin.clearance.${r.result}`)}
        />
      ),
    },
    async fetch(params, { user }) {
      const yearId = await getSelectedAcademicYear();
      if (!yearId) return { total: 0, rows: [] };
      const f = params.filters;
      let date = f.asOf ?? dayInTirane();
      if (f.session) {
        const session = (await listSessions(yearId)).find((s) => s.type === f.session);
        if (!session) return { total: 0, rows: [] };
        date = sessionClearanceDate(session.startDate);
      }
      const plans = await db.paymentPlan.findMany({
        where: {
          academicYearId: yearId,
          enrollment: {
            AND: [{ program: await finProgramScope(user, "fin.payment.read") }, ...studentWhere(f)],
          },
        },
        select: { id: true, enrollment: { select: enrollmentSelect } },
        orderBy: { id: "asc" },
      });
      const byStudent = new Map<string, (typeof plans)[number]>();
      for (const p of plans)
        if (!byStudent.has(p.enrollment.student.id)) byStudent.set(p.enrollment.student.id, p);
      const clearances = await getFinancialClearances([...byStudent.keys()], date);
      const all: ClearanceRow[] = [];
      for (const [studentId, p] of byStudent) {
        const c = clearances.get(studentId)!;
        const result = c.cleared ? "CLEARED" : "NOT_CLEARED";
        if (f.result && f.result !== result) continue;
        const person = p.enrollment.student.person;
        all.push({
          id: studentId,
          planId: p.id,
          personId: person.id,
          studentNumber: p.enrollment.student.studentNumber,
          name: `${person.lastName} ${person.firstName}`,
          program: p.enrollment.program.code,
          email: person.email ?? "",
          phone: person.phone ?? "",
          date,
          owed: c.owed,
          owedCents: c.owedCents,
          result,
        });
      }
      const key = params.sort.key;
      const sorted = sortRows(
        all,
        (r) =>
          key === "owed"
            ? r.owedCents
            : key === "result"
              ? r.result
              : ((r as Record<string, string | number>)[key] ?? r.studentNumber),
        params.sort.dir,
        (r) => r.studentNumber,
      );
      return { total: sorted.length, rows: pageRows(sorted, params.page, params.pageSize) };
    },
  }),
);
