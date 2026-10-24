import "server-only";
import { db, withTransaction } from "@/lib/db";
import { defineJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify/notify";
import { registerNotificationType } from "@/lib/notify/types";
import { displayMoney, formatCents } from "../domain/money";
import { dayInTirane, planBalance } from "../domain/payment-rules";
import {
  displayDay,
  reminderFor,
  resolveOverdueDays,
  resolveReminderDays,
  type ReminderKind,
} from "../domain/reminder-rules";
import { toDay } from "./fee.queries";
import { toInstallment, toPayments } from "./payment.queries";

// SRC-086, AC-1: the payment deadline notice always goes by e-mail as well (it cannot be switched off).
registerNotificationType({ type: "fin.payment-due", mandatory: true });
registerNotificationType({ type: "fin.payment-overdue", mandatory: true });

const TYPE: Record<ReminderKind, string> = {
  UPCOMING: "fin.payment-due",
  OVERDUE: "fin.payment-overdue",
};

const addDays = (day: string, n: number) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export async function getReminderSettings(): Promise<{
  daysBefore: number;
  overdueAfter: number | null;
}> {
  const rows = await db.systemSetting.findMany({
    where: { key: { in: ["fin.reminderDaysBefore", "fin.reminderOverdueAfterDays"] } },
  });
  const value = (k: string) => rows.find((r) => r.key === k)?.value;
  return {
    daysBefore: resolveReminderDays(value("fin.reminderDaysBefore")),
    overdueAfter: resolveOverdueDays(value("fin.reminderOverdueAfterDays")),
  };
}

type Candidate = {
  installmentId: string;
  studentId: string;
  personId: string;
  kind: ReminderKind;
  sequence: number;
  dueDate: string;
  outstandingCents: number;
};

export type ReminderRun = { candidates: number; sent: number; noAccount: number };

/**
 * AC-1..AC-5: finds the installments of active enrollments that call for a reminder today and sends
 * each one once to the student's own account (in-app + e-mail). A student without an account is
 * logged once as NO_ACCOUNT and tried again on later runs. Plans and payments are never changed.
 */
export async function sendPaymentReminders(
  now = new Date(),
  afterCommit?: (fn: () => Promise<void>) => void,
): Promise<ReminderRun> {
  const today = dayInTirane(now);
  const { daysBefore, overdueAfter } = await getReminderSettings();
  const limit = new Date(`${addDays(today, daysBefore)}T00:00:00Z`);
  const lower = overdueAfter === null ? { gte: new Date(`${today}T00:00:00Z`) } : {};

  // Allocation depends on the whole plan, so load every plan with an installment in range.
  const plans = await db.paymentPlan.findMany({
    where: {
      enrollment: { status: "ACTIVE" },
      installments: { some: { status: "ACTIVE", dueDate: { ...lower, lte: limit } } },
    },
    select: {
      enrollment: { select: { studentId: true, student: { select: { personId: true } } } },
      installments: { where: { status: "ACTIVE" } },
      payments: { where: { status: "RECORDED" } },
    },
  });

  const found: Candidate[] = [];
  for (const p of plans) {
    const inputs = p.installments.map(toInstallment);
    const balance = planBalance(inputs, toPayments(p.payments), today);
    const outstanding = new Map(balance.installments.map((l) => [l.id, l.outstandingCents]));
    for (const i of p.installments) {
      const outstandingCents = outstanding.get(i.id) ?? 0;
      const kind = reminderFor({
        dueDate: toDay(i.dueDate),
        today,
        outstandingCents,
        daysBefore,
        overdueAfter,
      });
      if (kind)
        found.push({
          installmentId: i.id,
          studentId: p.enrollment.studentId,
          personId: p.enrollment.student.personId,
          kind,
          sequence: i.sequence,
          dueDate: toDay(i.dueDate),
          outstandingCents,
        });
    }
  }

  // once per installment and kind (AC-2)
  const done = await db.paymentReminder.findMany({
    where: { installmentId: { in: found.map((c) => c.installmentId) }, outcome: "SENT" },
    select: { installmentId: true, kind: true },
  });
  const sentKeys = new Set(done.map((d) => `${d.installmentId}:${d.kind}`));
  const todo = found.filter((c) => !sentKeys.has(`${c.installmentId}:${c.kind}`));

  const run: ReminderRun = { candidates: todo.length, sent: 0, noAccount: 0 };
  for (const c of todo) {
    const user = await db.user.findFirst({
      where: { personId: c.personId, active: true },
      select: { id: true },
    });
    await withTransaction(async (tx) => {
      const snapshot = {
        installmentId: c.installmentId,
        studentId: c.studentId,
        kind: c.kind,
        dueDate: new Date(`${c.dueDate}T00:00:00Z`),
        outstanding: formatCents(c.outstandingCents),
      };
      if (!user) {
        const seen = await tx.paymentReminder.count({
          where: { installmentId: c.installmentId, kind: c.kind },
        });
        if (seen === 0) {
          await tx.paymentReminder.create({ data: { ...snapshot, outcome: "NO_ACCOUNT" } });
          run.noAccount += 1;
        }
        return;
      }
      const r = await notify(
        { db: tx, afterCommit },
        {
          userId: user.id,
          type: TYPE[c.kind],
          params: {
            sequence: c.sequence,
            date: displayDay(c.dueDate),
            amount: displayMoney(formatCents(c.outstandingCents)),
          },
          link: "/fin/mine",
          dedupeKey: `fin.reminder:${c.kind}:${c.installmentId}`,
        },
      );
      if (!r.notificationId) return; // already notified (dedupe key)
      await tx.paymentReminder.create({
        data: { ...snapshot, outcome: "SENT", userId: user.id },
      });
      run.sent += 1;
    });
  }
  return run;
}

export const paymentReminderJob = defineJob({
  name: "fin.reminders.send",
  cron: "0 7 * * *",
  retryLimit: 1,
  handler: async () => {
    const pending: (() => Promise<void>)[] = [];
    const r = await sendPaymentReminders(new Date(), (fn) => pending.push(fn));
    for (const fn of pending) await fn().catch(() => logger.warn("mail enqueue failed"));
    logger.info("payment reminders run", r);
  },
});
