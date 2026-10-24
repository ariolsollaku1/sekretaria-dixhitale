import "server-only";
import { db } from "@/lib/db";
import { centsOf, formatCents } from "../domain/money";
import {
  clearance,
  dayInTirane,
  owedOn,
  planBalance,
  type Clearance,
  type InstallmentInput,
  type InstallmentStatus,
  type PaymentInput,
  type PaymentMethod,
} from "../domain/payment-rules";
import type { FeeKind } from "../domain/fee-rules";
import { finProgramScope, money, toDay } from "./fee.queries";

type InstallmentRow = {
  id: string;
  sequence: number;
  dueDate: Date;
  amount: { toString(): string };
  earlyAmount: { toString(): string } | null;
  earlyUntil: Date | null;
};
type PaymentRow = {
  id: string;
  paidOn: Date;
  amount: { toString(): string };
  installmentId: string | null;
  createdAt: Date;
};

const toInstallment = (i: InstallmentRow): InstallmentInput => ({
  id: i.id,
  sequence: i.sequence,
  dueDate: toDay(i.dueDate),
  amountCents: centsOf(i.amount),
  earlyCents: i.earlyAmount ? centsOf(i.earlyAmount) : null,
  earlyUntil: i.earlyUntil ? toDay(i.earlyUntil) : null,
});
const toPayments = (rows: PaymentRow[]): PaymentInput[] =>
  [...rows]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((p, order) => ({
      id: p.id,
      paidOn: toDay(p.paidOn),
      amountCents: centsOf(p.amount),
      installmentId: p.installmentId,
      order,
    }));

const planArgs = {
  installments: { where: { status: "ACTIVE" as const } },
  payments: { where: { status: "RECORDED" as const } },
} as const;

export type PaymentView = {
  id: string;
  paidOn: string;
  amount: string;
  reference: string;
  method: PaymentMethod;
  installmentSequence: number | null;
  status: "RECORDED" | "VOIDED";
  voidReason: string | null;
  imported: boolean;
};
export type InstallmentFinance = {
  id: string;
  paid: string;
  waived: string;
  outstanding: string;
  settledEarly: boolean;
  status: InstallmentStatus;
};
export type PlanFinance = {
  installments: Record<string, InstallmentFinance>;
  payments: PaymentView[];
  due: string;
  paid: string;
  outstanding: string;
  overdue: string;
  credit: string;
  clearedToday: boolean;
  today: string;
};

/** AC-5, AC-10: balances of one plan (within the reader's programs) and its payments. */
export async function getPlanFinance(
  user: { id: string },
  planId: string,
): Promise<PlanFinance | null> {
  const p = await db.paymentPlan.findFirst({
    where: {
      id: planId,
      enrollment: { program: await finProgramScope(user, "fin.payment.read") },
    },
    include: {
      installments: { where: { status: "ACTIVE" } },
      payments: { orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!p) return null;
  const today = dayInTirane();
  const inputs = p.installments.map(toInstallment);
  const recorded = p.payments.filter((x) => x.status === "RECORDED");
  const b = planBalance(inputs, toPayments(recorded), today);
  const sequenceOf = new Map(
    (
      await db.planInstallment.findMany({
        where: { planId: p.id },
        select: { id: true, sequence: true },
      })
    ).map((i) => [i.id, i.sequence]),
  );
  return {
    installments: Object.fromEntries(
      b.installments.map((l) => [
        l.id,
        {
          id: l.id,
          paid: formatCents(l.paidCents),
          waived: formatCents(l.waivedCents),
          outstanding: formatCents(l.outstandingCents),
          settledEarly: l.settledEarly,
          status: l.status,
        },
      ]),
    ),
    payments: p.payments.map((x) => ({
      id: x.id,
      paidOn: toDay(x.paidOn),
      amount: money(x.amount),
      reference: x.reference,
      method: x.method,
      installmentSequence: x.installmentId ? (sequenceOf.get(x.installmentId) ?? null) : null,
      status: x.status,
      voidReason: x.voidReason,
      imported: x.importBatch !== null,
    })),
    due: formatCents(b.dueCents),
    paid: formatCents(b.paidCents),
    outstanding: formatCents(b.outstandingCents),
    overdue: formatCents(b.overdueCents),
    credit: formatCents(b.creditCents),
    clearedToday: owedOn(inputs, b, today) === 0,
    today,
  };
}

export type FinancialClearance = Clearance & { date: string; owed: string };

/**
 * AC-6 (Q-111): is the student financially cleared on `date` (default today in Tirane)? Looks at all
 * plans of the student of every year. Meant for server-side callers (EXM-03, GRD-01) that have
 * already checked their own permission; it does no scope filtering.
 */
export async function getFinancialClearance(
  studentId: string,
  date: string = dayInTirane(),
): Promise<FinancialClearance> {
  const map = await getFinancialClearances([studentId], date);
  return map.get(studentId)!;
}

/** Same for many students at once (one query). */
export async function getFinancialClearances(
  studentIds: string[],
  date: string = dayInTirane(),
): Promise<Map<string, FinancialClearance>> {
  const plans = await db.paymentPlan.findMany({
    where: { enrollment: { studentId: { in: studentIds } } },
    select: {
      enrollment: { select: { studentId: true } },
      ...planArgs,
    },
  });
  const byStudent = new Map<
    string,
    { installments: InstallmentInput[]; payments: PaymentInput[] }[]
  >();
  for (const p of plans) {
    const list = byStudent.get(p.enrollment.studentId) ?? [];
    list.push({
      installments: p.installments.map(toInstallment),
      payments: toPayments(p.payments),
    });
    byStudent.set(p.enrollment.studentId, list);
  }
  return new Map(
    studentIds.map((id) => {
      const c = clearance(byStudent.get(id) ?? [], date);
      return [id, { ...c, date, owed: formatCents(c.owedCents) }];
    }),
  );
}

export type OwnInstallment = {
  id: string;
  kind: FeeKind;
  label: string;
  dueDate: string;
  amount: string;
  paid: string;
  outstanding: string;
  status: InstallmentStatus;
  earlyAmount: string | null;
  earlyUntil: string | null;
};
export type OwnPlan = {
  id: string;
  yearCode: string;
  programCode: string;
  installments: OwnInstallment[];
  payments: {
    id: string;
    paidOn: string;
    amount: string;
    reference: string;
    method: PaymentMethod;
  }[];
  due: string;
  paid: string;
  outstanding: string;
  overdue: string;
  credit: string;
};
export type OwnFinance = {
  today: string;
  cleared: boolean;
  owed: string;
  plans: OwnPlan[];
};

/** AC-11 (Q-113): the signed-in student's own plans of all years; null without a student record. */
export async function getOwnFinance(user: { id: string }): Promise<OwnFinance | null> {
  const u = await db.user.findUnique({ where: { id: user.id }, select: { personId: true } });
  if (!u?.personId) return null;
  const student = await db.student.findUnique({
    where: { personId: u.personId },
    select: { id: true },
  });
  if (!student) return null;
  const today = dayInTirane();
  const plans = await db.paymentPlan.findMany({
    where: { enrollment: { studentId: student.id } },
    orderBy: { academicYear: { startDate: "desc" } },
    include: {
      academicYear: { select: { code: true } },
      enrollment: { select: { program: { select: { code: true } } } },
      installments: {
        where: { status: "ACTIVE" },
        orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
      },
      payments: { where: { status: "RECORDED" }, orderBy: [{ paidOn: "desc" }] },
    },
  });
  const views = plans.map((p): OwnPlan => {
    const b = planBalance(p.installments.map(toInstallment), toPayments(p.payments), today);
    const lines = new Map(b.installments.map((l) => [l.id, l]));
    return {
      id: p.id,
      yearCode: p.academicYear.code,
      programCode: p.enrollment.program.code,
      installments: p.installments.map((i) => {
        const l = lines.get(i.id)!;
        return {
          id: i.id,
          kind: i.kind,
          label: i.label,
          dueDate: toDay(i.dueDate),
          amount: money(i.amount),
          paid: formatCents(l.paidCents),
          outstanding: formatCents(l.outstandingCents),
          status: l.status,
          earlyAmount: i.earlyAmount ? money(i.earlyAmount) : null,
          earlyUntil: i.earlyUntil ? toDay(i.earlyUntil) : null,
        };
      }),
      payments: p.payments.map((x) => ({
        id: x.id,
        paidOn: toDay(x.paidOn),
        amount: money(x.amount),
        reference: x.reference,
        method: x.method,
      })),
      due: formatCents(b.dueCents),
      paid: formatCents(b.paidCents),
      outstanding: formatCents(b.outstandingCents),
      overdue: formatCents(b.overdueCents),
      credit: formatCents(b.creditCents),
    };
  });
  const c = await getFinancialClearance(student.id, today);
  return { today, cleared: c.cleared, owed: c.owed, plans: views };
}
