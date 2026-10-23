import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { zonedDay } from "@/lib/i18n/zone";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { manageWhere } from "./announcement.queries";

type Row = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  audience: string;
  publishDate: string;
  expiresDate: string;
  pinned: boolean;
};

const TONE: Record<Row["status"], StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};

/** AC-11: the management list, limited to what the author's scope allows. */
export const announcementsTable = registerTable(
  defineTable<Row>({
    id: "ntf.announcements",
    permission: "ntf.announcement.write",
    exportName: "announcements",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "title",
        labelKey: "ntf.columns.title",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "status", labelKey: "ntf.columns.status", type: "text", sortable: true },
      { key: "audience", labelKey: "ntf.columns.audience", type: "text" },
      { key: "publishDate", labelKey: "ntf.columns.publish", type: "date", sortable: true },
      { key: "expiresDate", labelKey: "ntf.columns.expires", type: "date" },
      { key: "pinned", labelKey: "ntf.columns.pinned", type: "boolean" },
    ],
    filters: [
      {
        key: "status",
        labelKey: "ntf.columns.status",
        type: "select",
        options: ["DRAFT", "PUBLISHED", "ARCHIVED"].map((v) => ({
          value: v,
          labelKey: `ntf.status.${v}`,
        })),
      },
      {
        key: "audience",
        labelKey: "ntf.columns.audience",
        type: "select",
        options: ["ALL", "STAFF", "STUDENTS", "CYCLE", "PROGRAM"].map((v) => ({
          value: v,
          labelKey: `ntf.audience.${v}`,
        })),
      },
    ],
    defaultSort: { key: "publishDate", dir: "desc" },
    values: {
      title: (r) => r.title,
      status: (r, { t }) => t(`ntf.status.${r.status}`),
      audience: (r, { t }) => t(`ntf.audience.${r.audience}`),
      publishDate: (r) => r.publishDate,
      expiresDate: (r) => r.expiresDate,
      pinned: (r) => r.pinned,
    },
    cells: {
      title: (r) => (
        <Link href={`/announcements/${r.id}`} className="underline">
          {r.title}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge tone={TONE[r.status]} label={t(`ntf.status.${r.status}`)} />
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const where: Prisma.AnnouncementWhereInput = { AND: [await manageWhere(user)] };
      if (f.status)
        (where.AND as Prisma.AnnouncementWhereInput[]).push({ status: f.status as Row["status"] });
      if (f.audience)
        (where.AND as Prisma.AnnouncementWhereInput[]).push({ audience: f.audience as never });
      const dir = params.sort.dir;
      const orderBy: Prisma.AnnouncementOrderByWithRelationInput[] =
        params.sort.key === "title"
          ? [{ title: dir }]
          : params.sort.key === "status"
            ? [{ status: dir }, { createdAt: "desc" }]
            : [{ publishAt: { sort: dir, nulls: "last" } }, { createdAt: "desc" }];
      const [total, rows] = await Promise.all([
        db.announcement.count({ where }),
        db.announcement.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
      ]);
      return {
        total,
        rows: rows.map((a) => ({
          id: a.id,
          title: a.title,
          status: a.status,
          audience: a.audience,
          publishDate: a.publishAt ? zonedDay(a.publishAt) : "",
          // the stored expiry is the start of the day after the last visible day
          expiresDate: a.expiresAt ? zonedDay(new Date(a.expiresAt.getTime() - 1)) : "",
          pinned: a.pinned,
        })),
      };
    },
  }),
);
