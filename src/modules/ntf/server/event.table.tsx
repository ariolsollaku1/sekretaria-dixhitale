import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { manageEventWhere } from "./event.queries";

type Row = {
  id: string;
  title: string;
  startsAt: Date;
  location: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  audience: string;
  registered: number;
  capacity: number | null;
};

const TONE: Record<Row["status"], StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  CANCELLED: "warning",
};

const AUDIENCES = ["ALL", "STAFF", "STUDENTS", "CYCLE", "PROGRAM"];

/** AC-11: the management list, limited to what the organiser's scope allows. */
export const eventsTable = registerTable(
  defineTable<Row>({
    id: "ntf.events",
    permission: "ntf.event.write",
    exportName: "events",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "title",
        labelKey: "evt.columns.title",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "startsAt", labelKey: "evt.columns.startsAt", type: "datetime", sortable: true },
      { key: "location", labelKey: "evt.columns.location", type: "text" },
      { key: "status", labelKey: "evt.columns.status", type: "text", sortable: true },
      { key: "audience", labelKey: "evt.columns.audience", type: "text" },
      { key: "registered", labelKey: "evt.columns.registered", type: "number" },
      { key: "capacity", labelKey: "evt.columns.capacity", type: "number" },
    ],
    filters: [
      {
        key: "status",
        labelKey: "evt.columns.status",
        type: "select",
        options: ["DRAFT", "PUBLISHED", "CANCELLED"].map((v) => ({
          value: v,
          labelKey: `evt.status.${v}`,
        })),
      },
      {
        key: "audience",
        labelKey: "evt.columns.audience",
        type: "select",
        options: AUDIENCES.map((v) => ({ value: v, labelKey: `ntf.audience.${v}` })),
      },
    ],
    defaultSort: { key: "startsAt", dir: "desc" },
    values: {
      title: (r) => r.title,
      startsAt: (r) => r.startsAt,
      location: (r) => r.location,
      status: (r, { t }) => t(`evt.status.${r.status}`),
      audience: (r, { t }) => t(`ntf.audience.${r.audience}`),
      registered: (r) => r.registered,
      capacity: (r) => r.capacity,
    },
    cells: {
      title: (r) => (
        <Link href={`/events/${r.id}`} className="underline">
          {r.title}
        </Link>
      ),
      status: (r, { t }) => (
        <StatusBadge tone={TONE[r.status]} label={t(`evt.status.${r.status}`)} />
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const and: Prisma.EventWhereInput[] = [await manageEventWhere(user)];
      if (f.status) and.push({ status: f.status as Row["status"] });
      if (f.audience) and.push({ audience: f.audience as never });
      const where: Prisma.EventWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.EventOrderByWithRelationInput[] =
        params.sort.key === "title"
          ? [{ title: dir }]
          : params.sort.key === "status"
            ? [{ status: dir }, { startsAt: "desc" }]
            : [{ startsAt: dir }, { id: "asc" }];
      const [total, rows] = await Promise.all([
        db.event.count({ where }),
        db.event.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((e) => ({
          id: e.id,
          title: e.title,
          startsAt: e.startsAt,
          location: e.location,
          status: e.status,
          audience: e.audience,
          registered: e._count.registrations,
          capacity: e.capacity,
        })),
      };
    },
  }),
);

type AttendeeRow = {
  id: string;
  name: string;
  email: string;
  event: string;
  registeredAt: Date;
};

/**
 * AC-11 (Q-121): who is registered, for the events the organiser may manage. Readers never get
 * this list. The `event` filter holds an event id.
 */
export const eventAttendeesTable = registerTable(
  defineTable<AttendeeRow>({
    id: "ntf.event-attendees",
    permission: "ntf.event.write",
    exportName: "event-attendees",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "name",
        labelKey: "evt.columns.name",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "email", labelKey: "evt.columns.email", type: "text" },
      { key: "event", labelKey: "evt.columns.event", type: "text" },
      {
        key: "registeredAt",
        labelKey: "evt.columns.registeredAt",
        type: "datetime",
        sortable: true,
      },
    ],
    filters: [{ key: "event", labelKey: "evt.columns.eventId", type: "text" }],
    defaultSort: { key: "registeredAt", dir: "asc" },
    values: {
      name: (r) => r.name,
      email: (r) => r.email,
      event: (r) => r.event,
      registeredAt: (r) => r.registeredAt,
    },
    async fetch(params, { user }) {
      const and: Prisma.EventRegistrationWhereInput[] = [
        { status: "REGISTERED" },
        { event: await manageEventWhere(user) },
      ];
      if (params.filters.event) and.push({ eventId: params.filters.event });
      const where: Prisma.EventRegistrationWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.EventRegistrationOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ user: { name: dir } }, { id: "asc" }]
          : [{ registeredAt: dir }, { id: "asc" }];
      const [total, rows] = await Promise.all([
        db.eventRegistration.count({ where }),
        db.eventRegistration.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            user: { select: { name: true, email: true } },
            event: { select: { title: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r) => ({
          id: r.id,
          name: r.user.name,
          email: r.user.email,
          event: r.event.title,
          registeredAt: r.registeredAt,
        })),
      };
    },
  }),
);
