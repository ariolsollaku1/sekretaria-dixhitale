import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { can } from "@/lib/authz/guard";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { EVENT_TYPES } from "../domain/schemas";
import { audienceFilter } from "./event.queries";

type Row = {
  id: string;
  title: string;
  type: (typeof EVENT_TYPES)[number];
  startDate: string;
  endDate: string;
  audience: string;
  active: boolean;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/** AC-8: the event list of the selected academic year; AC-9 audience filter, AC-5 cancelled only for writers. */
export const calendarEventsTable = registerTable(
  defineTable<Row>({
    id: "cal.events",
    permission: "cal.event.read",
    exportName: "calendar-events",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "title",
        labelKey: "cal.columns.title",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "type", labelKey: "cal.columns.type", type: "text", sortable: true },
      { key: "startDate", labelKey: "cal.columns.start", type: "date", sortable: true },
      { key: "endDate", labelKey: "cal.columns.end", type: "date", sortable: true },
      { key: "audience", labelKey: "cal.columns.audience", type: "text" },
      { key: "status", labelKey: "cal.columns.status", type: "text" },
    ],
    filters: [
      {
        key: "type",
        labelKey: "cal.columns.type",
        type: "select",
        options: EVENT_TYPES.map((v) => ({ value: v, labelKey: `cal.type.${v}` })),
      },
      {
        key: "audience",
        labelKey: "cal.columns.audience",
        type: "select",
        options: ["ALL", "CYCLE", "PROGRAM"].map((v) => ({
          value: v,
          labelKey: `cal.audience.${v}`,
        })),
      },
      {
        key: "status",
        labelKey: "cal.columns.status",
        type: "select",
        options: [
          { value: "active", labelKey: "cal.status.active" },
          { value: "cancelled", labelKey: "cal.status.cancelled" },
        ],
      },
    ],
    defaultSort: { key: "startDate", dir: "asc" },
    values: {
      title: (r) => r.title,
      type: (r, { t }) => t(`cal.type.${r.type}`),
      startDate: (r) => r.startDate,
      endDate: (r) => r.endDate,
      audience: (r, { t }) => t(`cal.audience.${r.audience}`),
      status: (r, { t }) => t(r.active ? "cal.status.active" : "cal.status.cancelled"),
    },
    cells: {
      title: (r) => (
        <Link href={`/calendar/events/${r.id}`} className="underline">
          {r.title}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge
          tone={r.active ? "success" : "neutral"}
          label={t(r.active ? "cal.status.active" : "cal.status.cancelled")}
        />
      ),
    },
    async fetch(params, { user }) {
      const yearId = await getSelectedAcademicYear();
      if (!yearId) return { total: 0, rows: [] };
      const mayWrite = await can(user, "cal.event.write");
      const f = params.filters;
      const where: Prisma.CalendarEventWhereInput = {
        academicYearId: yearId,
        ...(await audienceFilter(user.id)),
      };
      if (f.type) where.type = f.type as Row["type"];
      if (f.audience) where.audience = f.audience as "ALL" | "CYCLE" | "PROGRAM";
      // Readers without write access never see cancelled events.
      if (!mayWrite) where.active = true;
      else if (f.status) where.active = f.status === "active";
      const dir = params.sort.dir;
      const orderBy: Prisma.CalendarEventOrderByWithRelationInput[] =
        params.sort.key === "title"
          ? [{ title: dir }]
          : params.sort.key === "type"
            ? [{ type: dir }, { startDate: "asc" }]
            : params.sort.key === "endDate"
              ? [{ endDate: dir }]
              : [{ startDate: dir }, { title: "asc" }];
      const [total, rows] = await Promise.all([
        db.calendarEvent.count({ where }),
        db.calendarEvent.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
      ]);
      return {
        total,
        rows: rows.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          startDate: day(e.startDate),
          endDate: day(e.endDate),
          audience: e.audience,
          active: e.active,
        })),
      };
    },
  }),
);
