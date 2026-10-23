import "server-only";
import { db, withTransaction } from "@/lib/db";
import { defineJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify/notify";
import { BATCH_SIZE } from "../domain/message-schemas";
import { renderForPerson } from "./message.service";
import "./types";

export const MESSAGE_TYPE = "ntf.message";

/**
 * AC-6/AC-7: sends every pending message in batches. Each batch is one transaction in which the
 * notifications (dedupe key `message:<id>`) and the delivery rows change together, so a crash
 * resumes with the rows still QUEUED and nobody is notified twice. Returns messages completed.
 */
export async function sendPendingMessages(
  enqueueAfter: (fn: () => Promise<void>) => void = () => undefined,
): Promise<number> {
  const pending = await db.message.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  let completed = 0;
  for (const message of pending) {
    for (;;) {
      const batch = await db.messageRecipient.findMany({
        where: { messageId: message.id, state: "QUEUED" },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        include: { person: { select: { firstName: true, lastName: true } } },
      });
      if (batch.length === 0) break;
      const after: (() => Promise<void>)[] = [];
      await withTransaction(async (tx) => {
        for (const r of batch) {
          const result = await notify(
            { db: tx, afterCommit: (fn) => after.push(fn) },
            {
              userId: r.userId!,
              type: MESSAGE_TYPE,
              raw: renderForPerson(message, r.person),
              link: "/notifications",
              dedupeKey: `message:${message.id}`,
            },
          );
          await tx.messageRecipient.update({
            where: { id: r.id },
            data: {
              state: "DELIVERED",
              notificationId: result.notificationId,
              emailOutboxId: result.outboxId ?? null,
            },
          });
        }
      });
      for (const fn of after) enqueueAfter(fn);
    }
    await db.message.update({
      where: { id: message.id },
      data: { status: "SENT", completedAt: new Date() },
    });
    logger.info("message sent", { messageId: message.id, recipients: message.recipientCount });
    completed++;
  }
  return completed;
}

export const messageSendJob = defineJob({
  name: "ntf.message.send",
  cron: "* * * * *",
  retryLimit: 0,
  handler: async () => {
    const pending: (() => Promise<void>)[] = [];
    await sendPendingMessages((fn) => pending.push(fn));
    // e-mail sending is also covered by the plt.mail.flush job if these enqueues fail
    for (const fn of pending) await fn().catch(() => logger.warn("mail enqueue failed"));
  },
});
