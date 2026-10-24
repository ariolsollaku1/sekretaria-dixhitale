import "server-only";
import { db } from "@/lib/db";
import { planTotals, type FeeKind } from "../domain/fee-rules";
import { centsOf, formatCents } from "../domain/money";
import { finProgramScope, money, toDay } from "./fee.queries";

export type InstallmentView = {
  id: string;
  sequence: number;
  kind: FeeKind;
  label: string;
  dueDate: string;
  amount: string;
  earlyAmount: string | null;
  earlyUntil: string | null;
  status: "ACTIVE" | "CANCELLED";
  cancelReason: string | null;
  adjusted: boolean;
};

export type PlanView = {
  id: string;
  academicYearId: string;
  yearCode: string;
  yearStatus: "PLANNED" | "CURRENT" | "CLOSED";
  studentNumber: string;
  studentName: string;
  programCode: string;
  installments: InstallmentView[];
  count: number;
  total: string;
  earlyTotal: string;
};

/** AC-9/AC-10: a plan with its installments and totals, if it is within the reader's programs. */
export async function getPlan(user: { id: string }, planId: string): Promise<PlanView | null> {
  const p = await db.paymentPlan.findFirst({
    where: {
      id: planId,
      enrollment: { program: await finProgramScope(user, "fin.plan.read") },
    },
    include: {
      academicYear: { select: { code: true, status: true } },
      installments: { orderBy: [{ dueDate: "asc" }, { sequence: "asc" }] },
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
  });
  if (!p) return null;
  const totals = planTotals(
    p.installments.map((i) => ({
      status: i.status,
      amountCents: centsOf(i.amount),
      earlyCents: i.earlyAmount ? centsOf(i.earlyAmount) : null,
    })),
  );
  return {
    id: p.id,
    academicYearId: p.academicYearId,
    yearCode: p.academicYear.code,
    yearStatus: p.academicYear.status,
    studentNumber: p.enrollment.student.studentNumber,
    studentName: `${p.enrollment.student.person.lastName} ${p.enrollment.student.person.firstName}`,
    programCode: p.enrollment.program.code,
    installments: p.installments.map((i) => ({
      id: i.id,
      sequence: i.sequence,
      kind: i.kind,
      label: i.label,
      dueDate: toDay(i.dueDate),
      amount: money(i.amount),
      earlyAmount: i.earlyAmount ? money(i.earlyAmount) : null,
      earlyUntil: i.earlyUntil ? toDay(i.earlyUntil) : null,
      status: i.status,
      cancelReason: i.cancelReason,
      adjusted: i.adjustedAt !== null,
    })),
    count: totals.count,
    total: formatCents(totals.totalCents),
    earlyTotal: formatCents(totals.earlyTotalCents),
  };
}
