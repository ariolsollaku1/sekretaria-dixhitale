import "server-only";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { mayReadMessage } from "./message.service";

export const LOG_PAGE_SIZE = 100;

export type EmailState = "NONE" | "QUEUED" | "SENT" | "FAILED";

export type MessageDetail = {
  id: string;
  subject: string;
  body: string;
  sourceTable: string;
  filters: Record<string, string>;
  status: "PENDING" | "SENT";
  recipientCount: number;
  noAccountCount: number;
  createdAt: Date;
  completedAt: Date | null;
  createdByName: string;
  counts: { delivered: number; queued: number; noAccount: number };
};

/** AC-8: a message is visible to its sender and to system administrators; anything else is a 404. */
export async function getMessageDetail(
  user: { id: string },
  id: string,
): Promise<MessageDetail | null> {
  const m = await db.message.findUnique({ where: { id } });
  if (!m || !(await mayReadMessage(user, m))) return null;
  const [sender, grouped] = await Promise.all([
    db.user.findUnique({ where: { id: m.createdById }, select: { name: true } }),
    db.messageRecipient.groupBy({ by: ["state"], where: { messageId: id }, _count: true }),
  ]);
  const count = (s: string) => grouped.find((g) => g.state === s)?._count ?? 0;
  return {
    id: m.id,
    subject: m.subject,
    body: m.body,
    sourceTable: m.sourceTable,
    filters: m.filters as Record<string, string>,
    status: m.status,
    recipientCount: m.recipientCount,
    noAccountCount: m.noAccountCount,
    createdAt: m.createdAt,
    completedAt: m.completedAt,
    createdByName: sender?.name ?? "",
    counts: {
      delivered: count("DELIVERED"),
      queued: count("QUEUED"),
      noAccount: count("NO_ACCOUNT"),
    },
  };
}

export type LogRow = {
  id: string;
  name: string;
  state: "QUEUED" | "DELIVERED" | "NO_ACCOUNT";
  email: EmailState;
};

/** AC-8: the delivery log of a message, one page; names and states only, never an address. */
export async function getDeliveryLog(messageId: string, page: number) {
  const where = { messageId };
  const [total, rows] = await Promise.all([
    db.messageRecipient.count({ where }),
    db.messageRecipient.findMany({
      where,
      orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }, { id: "asc" }],
      skip: (page - 1) * LOG_PAGE_SIZE,
      take: LOG_PAGE_SIZE,
      include: { person: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const outboxIds = rows.map((r) => r.emailOutboxId).filter((x): x is string => !!x);
  const outbox = await db.emailOutbox.findMany({
    where: { id: { in: outboxIds } },
    select: { id: true, status: true },
  });
  const status = new Map(outbox.map((o) => [o.id, o.status]));
  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / LOG_PAGE_SIZE)),
    rows: rows.map<LogRow>((r) => ({
      id: r.id,
      name: `${r.person.lastName} ${r.person.firstName}`,
      state: r.state,
      email: r.emailOutboxId ? (status.get(r.emailOutboxId) ?? "QUEUED") : "NONE",
    })),
  };
}

export type TemplateRow = { id: string; name: string; subject: string; body: string };

export async function listTemplates(): Promise<TemplateRow[]> {
  return db.messageTemplate.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, subject: true, body: true },
  });
}

/** Sender sees own messages; `plt.audit.read` holders (system administrators) all of them. */
export async function messageScope(user: { id: string }) {
  return (await can(user, "plt.audit.read")) ? {} : { createdById: user.id };
}
