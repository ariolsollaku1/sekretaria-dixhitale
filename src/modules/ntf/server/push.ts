import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, withTransaction } from "@/lib/db";
import { defineJob } from "@/lib/jobs/registry";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify/notify";
import "./types";

const BATCH = 200;
export const PUSH_TYPE = "ntf.announcement";

/** AC-7: who gets the push. CYCLE/PROGRAM are refused by the database for `email_push`. */
async function recipientIds(audience: string, now: Date): Promise<string[]> {
  const validRole: Prisma.UserRoleWhereInput = {
    validFrom: { lte: now },
    OR: [{ validTo: null }, { validTo: { gt: now } }],
  };
  const where: Prisma.UserWhereInput = { active: true };
  if (audience === "STAFF") where.roles = { some: { ...validRole, role: { not: "student" } } };
  if (audience === "STUDENTS") where.roles = { some: { ...validRole, role: "student" } };
  return (await db.user.findMany({ where, select: { id: true }, orderBy: { id: "asc" } })).map(
    (u) => u.id,
  );
}

/**
 * AC-7/AC-8: fan out every due announcement once. Each recipient's notification carries the dedupe
 * key `announcement:<id>`, so a crash half-way (or two runs) cannot notify anybody twice; `pushedAt`
 * is set after the last batch. Returns how many announcements were completed.
 */
export async function pushDueAnnouncements(
  now = new Date(),
  enqueueAfter: (fn: () => Promise<void>) => void = () => undefined,
): Promise<number> {
  const due = await db.announcement.findMany({
    where: {
      status: "PUBLISHED",
      emailPush: true,
      pushedAt: null,
      publishAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, title: true, audience: true },
    orderBy: { publishAt: "asc" },
    take: 20,
  });
  for (const a of due) {
    const ids = await recipientIds(a.audience, now);
    for (let i = 0; i < ids.length; i += BATCH) {
      const after: (() => Promise<void>)[] = [];
      await withTransaction(async (tx) => {
        for (const userId of ids.slice(i, i + BATCH))
          await notify(
            { db: tx, afterCommit: (fn) => after.push(fn) },
            {
              userId,
              type: PUSH_TYPE,
              params: { title: a.title },
              link: `/announcements/${a.id}`,
              dedupeKey: `announcement:${a.id}`,
            },
          );
      });
      for (const fn of after) enqueueAfter(fn);
    }
    await db.announcement.update({ where: { id: a.id }, data: { pushedAt: new Date() } });
    logger.info("announcement pushed", { announcementId: a.id, recipients: ids.length });
  }
  return due.length;
}

export const announcementPushJob = defineJob({
  name: "ntf.announcement.push",
  cron: "* * * * *",
  retryLimit: 0,
  handler: async () => {
    const pending: (() => Promise<void>)[] = [];
    await pushDueAnnouncements(new Date(), (fn) => pending.push(fn));
    // sending is also covered by the plt.mail.flush job if these enqueues fail
    for (const fn of pending) await fn().catch(() => logger.warn("mail enqueue failed"));
  },
});
