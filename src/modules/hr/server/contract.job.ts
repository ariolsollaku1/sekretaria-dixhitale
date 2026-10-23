import "server-only";
import { db, withTransaction } from "@/lib/db";
import { defineJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify/notify";
import { registerNotificationType } from "@/lib/notify/types";
import { isoWeekKey } from "../domain/contract-rules";
import { getHorizonDays, today } from "./contract.queries";

// AC-4: the weekly notice to HR.
registerNotificationType({ type: "hr.contracts" });

const addDays = (day: string, n: number) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Counts the employed academic staff whose contract ended or ends within the horizon and, when
 * there is something to see, tells every HR user once per ISO week (the dedupe key makes a second
 * run in the same week send nothing). Staff records are never touched (AC-5).
 */
export async function notifyContractExpiry(
  now = new Date(),
  afterCommit?: (fn: () => Promise<void>) => void,
): Promise<{ ended: number; soon: number; notified: number }> {
  const day = today(now);
  const horizon = await getHorizonDays();
  const start = new Date(`${day}T00:00:00Z`);
  const limit = new Date(`${addDays(day, horizon)}T00:00:00Z`);
  const base = { active: true, kind: "ACADEMIC" as const };
  const [ended, soon] = await Promise.all([
    db.staff.count({ where: { ...base, contractEnd: { lt: start } } }),
    db.staff.count({ where: { ...base, contractEnd: { gte: start, lte: limit } } }),
  ]);
  if (ended + soon === 0) return { ended, soon, notified: 0 };

  const hrUsers = await db.user.findMany({
    where: {
      active: true,
      roles: {
        some: {
          role: "hr",
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
      },
    },
    select: { id: true },
  });
  const week = isoWeekKey(day);
  let notified = 0;
  await withTransaction(async (tx) => {
    for (const u of hrUsers) {
      const r = await notify(
        { db: tx, afterCommit },
        {
          userId: u.id,
          type: "hr.contracts",
          params: { ended, soon },
          link: "/hr/contracts",
          dedupeKey: `hr.contracts:${week}`,
        },
      );
      if (r.notificationId) notified += 1;
    }
  });
  return { ended, soon, notified };
}

export const contractExpiryJob = defineJob({
  name: "hr.contracts.notify",
  cron: "0 7 * * 1",
  retryLimit: 1,
  handler: async () => {
    const pending: (() => Promise<void>)[] = [];
    const r = await notifyContractExpiry(new Date(), (fn) => pending.push(fn));
    for (const fn of pending) await fn().catch(() => logger.warn("mail enqueue failed"));
    logger.info("contract expiry checked", r);
  },
});
