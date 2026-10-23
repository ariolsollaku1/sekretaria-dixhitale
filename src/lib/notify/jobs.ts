import "server-only";
import { db } from "@/lib/db";
import { defineJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";
import { getMailTransport, MailError, type MailTransport } from "@/lib/mail";

const MAX_RETRIES = 4; // 5 attempts in total (AC-6)

/**
 * AC-6: send one outbox row. Idempotent: a row that is no longer QUEUED is left alone.
 * Transient failures throw so the job system retries with back-off; permanent ones, and the last
 * transient one, end as FAILED. Only a short code is stored, never the provider's text, and the
 * address stays out of logs (AC-13).
 */
export async function sendOutboxMessage(
  outboxId: string,
  attempt: number,
  transport: MailTransport = getMailTransport(),
): Promise<void> {
  const row = await db.emailOutbox.findUnique({ where: { id: outboxId } });
  if (!row || row.status !== "QUEUED") return;
  try {
    await transport.send({
      to: row.toAddress,
      subject: row.subject,
      html: row.html,
      text: row.text,
    });
    await db.emailOutbox.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), attempts: attempt + 1, lastErrorCode: null },
    });
    logger.info("mail sent", { outboxId, type: row.type });
  } catch (error) {
    const code = error instanceof MailError ? error.code : "UNKNOWN";
    const retryable = error instanceof MailError ? error.retryable : true;
    const exhausted = attempt >= MAX_RETRIES;
    await db.emailOutbox.update({
      where: { id: row.id },
      data: {
        attempts: attempt + 1,
        lastErrorCode: code,
        status: !retryable || exhausted ? "FAILED" : "QUEUED",
      },
    });
    logger.error("mail failed", {
      outboxId,
      type: row.type,
      code,
      attempt,
      final: !retryable || exhausted,
    });
    if (retryable && !exhausted)
      throw new MailError(code === "UNKNOWN" ? "UNKNOWN" : (code as MailError["code"]), true);
  }
}

/** AC-5: rows still QUEUED after `olderThanMs` get their send job (the key makes this safe to repeat). */
export async function flushStaleOutbox(
  enqueueSend: (outboxId: string) => Promise<unknown>,
  olderThanMs = 2 * 60_000,
  now = new Date(),
): Promise<number> {
  const stale = await db.emailOutbox.findMany({
    where: { status: "QUEUED", createdAt: { lt: new Date(now.getTime() - olderThanMs) } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const row of stale) await enqueueSend(row.id);
  return stale.length;
}

export const mailSendJob = defineJob<{ outboxId: string }>({
  name: "plt.mail.send",
  retryLimit: MAX_RETRIES,
  retryDelaySeconds: 60,
  retryBackoff: true,
  concurrency: 3,
  handler: (data, ctx) => sendOutboxMessage(data.outboxId, ctx.attempt),
});

export const mailFlushJob = defineJob({
  name: "plt.mail.flush",
  cron: "* * * * *",
  retryLimit: 0,
  handler: async () => {
    const { enqueue } = await import("@/lib/jobs");
    const count = await flushStaleOutbox((id) =>
      enqueue("plt.mail.send", { outboxId: id }, { key: `mail:${id}` }),
    );
    if (count > 0) logger.info("mail flush", { count });
  },
});
