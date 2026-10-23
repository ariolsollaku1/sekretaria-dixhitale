import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import { isIsoDay, startOfZonedDay, zonedDayBounds } from "@/lib/i18n/zoned";

type AuditTableRow = {
  id: string;
  at: Date;
  actor: string;
  action: string;
  entity: string;
};

/** AC-6 of PLT-07 on the shared table framework: sysadmin-only, newest first, filters in the URL. */
export const auditTable = registerTable(
  defineTable<AuditTableRow>({
    id: "plt.audit",
    permission: "plt.audit.read",
    exportName: "audit",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "at",
        labelKey: "audit.columns.time",
        type: "datetime",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "actor", labelKey: "audit.columns.actor", type: "text" },
      { key: "action", labelKey: "audit.columns.action", type: "text" },
      { key: "entity", labelKey: "audit.columns.entity", type: "text" },
    ],
    filters: [
      { key: "actor", labelKey: "audit.filters.actor", type: "text" },
      { key: "action", labelKey: "audit.filters.action", type: "text" },
      { key: "entityType", labelKey: "audit.filters.entityType", type: "text" },
      { key: "entityId", labelKey: "audit.filters.entityId", type: "text" },
      { key: "from", labelKey: "audit.filters.from", type: "date" },
      { key: "to", labelKey: "audit.filters.to", type: "date" },
    ],
    defaultSort: { key: "at", dir: "desc" },
    values: {
      at: (r) => r.at,
      actor: (r, { t }) =>
        r.actor === "SYSTEM"
          ? t("audit.actors.system")
          : r.actor === "PUBLIC"
            ? t("audit.actors.public")
            : r.actor,
      action: (r) => r.action,
      entity: (r) => r.entity,
    },
    cells: {
      at: (r, { locale }) => (
        <Link href={`/admin/audit/${r.id}`} className="font-tabular underline">
          {new Intl.DateTimeFormat(locale === "sq" ? "sq-AL" : "en-GB", {
            dateStyle: "medium",
            timeStyle: "medium",
            timeZone: "Europe/Tirane",
          }).format(r.at)}
        </Link>
      ),
      actor: (r, { t }) =>
        r.actor === "SYSTEM"
          ? t("audit.actors.system")
          : r.actor === "PUBLIC"
            ? t("audit.actors.public")
            : r.actor,
      action: (r) => <span className="font-tabular">{r.action}</span>,
      entity: (r) => <span className="font-tabular break-all">{r.entity}</span>,
    },
    async fetch(params) {
      const where: Prisma.AuditLogWhereInput = {};
      const f = params.filters;
      if (f.actor) {
        const lower = f.actor.toLowerCase();
        if (lower === "system" || lower === "public")
          where.actorType = lower === "system" ? "SYSTEM" : "PUBLIC";
        else {
          const users = await db.user.findMany({
            where: { email: { contains: f.actor, mode: "insensitive" } },
            select: { id: true },
            take: 100,
          });
          if (users.length === 0) return { rows: [], total: 0 };
          where.actorUserId = { in: users.map((u) => u.id) };
        }
      }
      if (f.action) where.action = f.action.endsWith(".") ? { startsWith: f.action } : f.action;
      if (f.entityType) where.entityType = f.entityType;
      if (f.entityId) where.entityId = f.entityId;
      const at: Prisma.DateTimeFilter = {};
      if (isIsoDay(f.from)) at.gte = startOfZonedDay(f.from);
      if (isIsoDay(f.to)) at.lt = zonedDayBounds(f.to).end;
      if (at.gte || at.lt) where.at = at;

      const [total, entries] = await Promise.all([
        db.auditLog.count({ where }),
        db.auditLog.findMany({
          where,
          orderBy: [{ at: params.sort.dir }, { id: params.sort.dir }],
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          select: {
            id: true,
            at: true,
            actorType: true,
            actorUserId: true,
            action: true,
            entityType: true,
            entityId: true,
          },
        }),
      ]);
      const ids = [...new Set(entries.flatMap((e) => (e.actorUserId ? [e.actorUserId] : [])))];
      const users = ids.length
        ? await db.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, email: true },
          })
        : [];
      const labels = new Map(users.map((u) => [u.id, `${u.name} (${u.email})`]));
      return {
        total,
        rows: entries.map((e) => ({
          id: e.id,
          at: e.at,
          actor: e.actorUserId ? (labels.get(e.actorUserId) ?? e.actorUserId) : e.actorType,
          action: e.action,
          entity: e.entityId ? `${e.entityType} · ${e.entityId}` : e.entityType,
        })),
      };
    },
  }),
);
