import "server-only";
import { db } from "@/lib/db";
import { listNotificationTypes } from "./types";

export const NOTIFICATIONS_PAGE_SIZE = 20;

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
};

const view = (n: {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  readAt: Date | null;
}): NotificationView => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  createdAt: n.createdAt,
  read: n.readAt !== null,
});

/** AC-8: unread count and the latest few, for the bell. Always scoped to the given user. */
export async function bellData(userId: string) {
  const [unread, latest] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    }),
  ]);
  return { unread, latest: latest.map(view) };
}

/** AC-9: the user's own notifications, newest first, server-side pagination. */
export async function listNotifications(userId: string, page: number) {
  const total = await db.notification.count({ where: { userId } });
  const pageCount = Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (current - 1) * NOTIFICATIONS_PAGE_SIZE,
    take: NOTIFICATIONS_PAGE_SIZE,
  });
  return { rows: rows.map(view), total, page: current, pageCount };
}

/** AC-11: optional types with the user's current e-mail choice; mandatory ones are marked. */
export async function preferencesFor(userId: string) {
  const stored = await db.notificationPreference.findMany({ where: { userId } });
  return listNotificationTypes()
    .filter((t) => t.emailable)
    .map((t) => ({
      type: t.type,
      mandatory: t.mandatory,
      email: t.mandatory ? true : (stored.find((s) => s.type === t.type)?.email ?? true),
    }));
}

/** AC-12: counts for the jobs page. */
export async function outboxCounts() {
  const rows = await db.emailOutbox.groupBy({ by: ["status"], _count: { _all: true } });
  const get = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { queued: get("QUEUED"), sent: get("SENT"), failed: get("FAILED") };
}
