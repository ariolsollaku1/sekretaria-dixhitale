import "server-only";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { messageScope } from "./message.queries";

type Row = {
  id: string;
  subject: string;
  createdAt: Date;
  source: string;
  recipientCount: number;
  noAccountCount: number;
  status: "PENDING" | "SENT";
};

/** AC-8: the messages the user sent (system administrators: all). */
export const messagesTable = registerTable(
  defineTable<Row>({
    id: "ntf.messages",
    permission: "ntf.message.send",
    exportName: "messages",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "subject",
        labelKey: "msg.columns.subject",
        type: "text",
        alwaysVisible: true,
      },
      { key: "createdAt", labelKey: "msg.columns.sentAt", type: "datetime", sortable: true },
      { key: "source", labelKey: "msg.columns.source", type: "text" },
      { key: "recipientCount", labelKey: "msg.columns.recipients", type: "number" },
      { key: "noAccountCount", labelKey: "msg.columns.noAccount", type: "number" },
      { key: "status", labelKey: "msg.columns.status", type: "text" },
    ],
    filters: [
      {
        key: "status",
        labelKey: "msg.columns.status",
        type: "select",
        options: ["PENDING", "SENT"].map((v) => ({ value: v, labelKey: `msg.status.${v}` })),
      },
    ],
    defaultSort: { key: "createdAt", dir: "desc" },
    values: {
      subject: (r) => r.subject,
      createdAt: (r) => r.createdAt,
      source: (r, { t }) => t(`msg.source.${r.source.replace(".", "_")}`),
      recipientCount: (r) => r.recipientCount,
      noAccountCount: (r) => r.noAccountCount,
      status: (r, { t }) => t(`msg.status.${r.status}`),
    },
    cells: {
      subject: (r) => (
        <Link href={`/messages/${r.id}`} className="underline">
          {r.subject}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge
          tone={r.status === "SENT" ? "success" : "warning"}
          label={t(`msg.status.${r.status}`)}
        />
      ),
    },
    async fetch(params, { user }) {
      const where = {
        ...(await messageScope(user)),
        ...(params.filters.status ? { status: params.filters.status as Row["status"] } : {}),
      };
      const [total, rows] = await Promise.all([
        db.message.count({ where }),
        db.message.findMany({
          where,
          orderBy: { createdAt: params.sort.dir },
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
      ]);
      return {
        total,
        rows: rows.map((m) => ({
          id: m.id,
          subject: m.subject,
          createdAt: m.createdAt,
          source: m.sourceTable,
          recipientCount: m.recipientCount,
          noAccountCount: m.noAccountCount,
          status: m.status,
        })),
      };
    },
  }),
);
