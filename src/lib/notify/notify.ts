import "server-only";
import type { Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { resolveLocale } from "@/lib/i18n/config";
import { enqueue } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import en from "../../../messages/en.json";
import sq from "../../../messages/sq.json";
import { decideChannels, safeLink } from "./channels";
import { renderMessage, type Params } from "./render";
import { getNotificationType } from "./types";

const CATALOGS = { sq, en } as const;

export type NotifyInput = {
  userId: string;
  type: string;
  params?: Params;
  /** Relative path opened when the notification is clicked. */
  link?: string | null;
  /** One notification per user + key (e.g. reminders); repeating it does nothing. */
  dedupeKey?: string;
};

export type NotifyContext = {
  db: Pick<Tx, "user" | "notification" | "notificationPreference" | "emailOutbox">;
  /** Present inside the action wrapper: sends the job right after commit (else the flush job does). */
  afterCommit?: (fn: () => Promise<void>) => void;
};

export type NotifyResult = { notificationId: string | null; emailQueued: boolean };

/**
 * AC-2: writes the in-app notification and, if allowed, the e-mail outbox row in the CALLER's
 * transaction, so a rolled-back change notifies nobody. Never logs the address.
 */
export async function notify(ctx: NotifyContext, input: NotifyInput): Promise<NotifyResult> {
  const type = getNotificationType(input.type);
  if (!type) throw new Error(`Unknown notification type "${input.type}"`);

  const user = await ctx.db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, locale: true, active: true },
  });
  if (!user) {
    logger.warn("notify: unknown user", { type: input.type, userId: input.userId });
    return { notificationId: null, emailQueued: false };
  }

  const locale = resolveLocale({ user: user.locale, fallback: env.DEFAULT_LOCALE });
  const link = safeLink(input.link);
  const rendered = renderMessage({
    type: input.type,
    params: input.params ?? {},
    locale,
    messages: CATALOGS[locale],
    link,
    appUrl: env.APP_URL,
  });

  const created = await ctx.db.notification.createManyAndReturn({
    data: [
      {
        userId: user.id,
        type: input.type,
        title: rendered.title,
        body: rendered.body,
        link,
        dedupeKey: input.dedupeKey ?? null,
      },
    ],
    skipDuplicates: true,
  });
  const notification = created[0];
  if (!notification) return { notificationId: null, emailQueued: false }; // repeated dedupeKey

  const preference = await ctx.db.notificationPreference.findUnique({
    where: { userId_type: { userId: user.id, type: input.type } },
    select: { email: true },
  });
  const channels = decideChannels({
    mandatory: type.mandatory,
    emailable: type.emailable,
    userActive: user.active,
    hasEmail: !!user.email,
    emailPreference: preference?.email,
  });
  if (!channels.email) return { notificationId: notification.id, emailQueued: false };

  const outbox = await ctx.db.emailOutbox.create({
    data: {
      userId: user.id,
      toAddress: user.email,
      type: input.type,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
  });
  ctx.afterCommit?.(async () => {
    await enqueue("plt.mail.send", { outboxId: outbox.id }, { key: `mail:${outbox.id}` });
  });
  return { notificationId: notification.id, emailQueued: true };
}
