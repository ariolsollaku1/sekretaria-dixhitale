import "server-only";
import { db, withTransaction } from "@/lib/db";
import { defineJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify/notify";
import { REMINDER_WINDOW_MS } from "../domain/event-rules";
import { whenText } from "./event.service";
import "./types";

const BATCH = 200;

/**
 * AC-8 (Q-120): remind everybody registered for a published event that starts within 24 hours.
 * Each notification carries the dedupe key `event-reminder:<id>`, so a crash half-way (or two
 * runs) cannot remind anybody twice; `remindedAt` is set after the last batch. Returns how many
 * events were completed.
 */
export async function remindDueEvents(
  now = new Date(),
  enqueueAfter: (fn: () => Promise<void>) => void = () => undefined,
): Promise<number> {
  const due = await db.event.findMany({
    where: {
      status: "PUBLISHED",
      remindedAt: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
    },
    select: { id: true, title: true, startsAt: true },
    orderBy: { startsAt: "asc" },
    take: 50,
  });
  for (const e of due) {
    const registered = await db.eventRegistration.findMany({
      where: { eventId: e.id, status: "REGISTERED" },
      select: { userId: true },
      orderBy: { id: "asc" },
    });
    for (let i = 0; i < registered.length; i += BATCH) {
      const after: (() => Promise<void>)[] = [];
      await withTransaction(async (tx) => {
        for (const r of registered.slice(i, i + BATCH))
          await notify(
            { db: tx, afterCommit: (fn) => after.push(fn) },
            {
              userId: r.userId,
              type: "ntf.event-reminder",
              params: { title: e.title, when: whenText(e.startsAt) },
              link: `/events/${e.id}`,
              dedupeKey: `event-reminder:${e.id}`,
            },
          );
      });
      for (const fn of after) enqueueAfter(fn);
    }
    await db.event.update({ where: { id: e.id }, data: { remindedAt: new Date() } });
    logger.info("event reminded", { eventId: e.id, recipients: registered.length });
  }
  return due.length;
}

export const eventReminderJob = defineJob({
  name: "ntf.event.remind",
  cron: "5 * * * *",
  retryLimit: 0,
  handler: async () => {
    const pending: (() => Promise<void>)[] = [];
    await remindDueEvents(new Date(), (fn) => pending.push(fn));
    // sending is also covered by the plt.mail.flush job if these enqueues fail
    for (const fn of pending) await fn().catch(() => logger.warn("mail enqueue failed"));
  },
});
