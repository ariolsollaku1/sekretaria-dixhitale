import "server-only";
import type { Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { resolveLocale } from "@/lib/i18n/config";
import { enqueue } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { renderMessage } from "@/lib/notify/render";
import en from "../../../../messages/en.json";
import sq from "../../../../messages/sq.json";

const CATALOGS = { sq, en } as const;

export type ApplicationMailKind = "adm.application-received" | "adm.link-reissued";

/**
 * AC-6, AC-10: puts the e-mail of a candidate into the outbox in the CALLER's transaction (so a
 * rolled-back application mails nobody) and returns the id to send after commit. The candidate
 * has no account, hence no `userId` and no preferences. The address is never logged.
 */
export async function queueApplicationMail(
  tx: Pick<Tx, "emailOutbox">,
  input: {
    kind: ApplicationMailKind;
    to: string;
    locale: string;
    name: string;
    reference: string;
    token: string;
  },
): Promise<string> {
  const locale = resolveLocale({ user: input.locale, fallback: env.DEFAULT_LOCALE });
  const rendered = renderMessage({
    type: input.kind,
    params: { name: input.name, reference: input.reference },
    locale,
    messages: CATALOGS[locale],
    link: `/apply/status/${input.token}`,
    appUrl: env.APP_URL,
  });
  const row = await tx.emailOutbox.create({
    data: {
      userId: null,
      toAddress: input.to,
      type: input.kind,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
  });
  return row.id;
}

/** Sends right after commit; the minutely flush job is the safety net if this fails. */
export async function sendQueued(outboxId: string): Promise<void> {
  try {
    await enqueue("plt.mail.send", { outboxId }, { key: `mail:${outboxId}` });
  } catch {
    logger.warn("application mail left to the flush job", { outboxId });
  }
}
