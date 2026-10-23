import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isIsoDay, startOfZonedDay, zonedDayBounds } from "@/lib/i18n/zoned";

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilters = {
  /** Part of the actor's email, or the words "system" / "public". */
  actor?: string;
  /** Exact action or a prefix ending in ".", e.g. "auth.". */
  action?: string;
  entityType?: string;
  entityId?: string;
  /** Inclusive calendar days (YYYY-MM-DD) in Europe/Tirane. */
  from?: string;
  to?: string;
};

export type AuditRow = {
  id: string;
  at: Date;
  actor: { type: "USER" | "SYSTEM" | "PUBLIC"; userId: string | null; label: string | null };
  action: string;
  entityType: string;
  entityId: string | null;
};

async function buildWhere(filters: AuditFilters): Promise<Prisma.AuditLogWhereInput | null> {
  const where: Prisma.AuditLogWhereInput = {};
  const actor = filters.actor?.trim();
  if (actor) {
    const lower = actor.toLowerCase();
    if (lower === "system" || lower === "public") {
      where.actorType = lower === "system" ? "SYSTEM" : "PUBLIC";
    } else {
      const users = await db.user.findMany({
        where: { email: { contains: actor, mode: "insensitive" } },
        select: { id: true },
        take: 100,
      });
      if (users.length === 0) return null; // nobody matches: empty result, no query needed
      where.actorUserId = { in: users.map((u) => u.id) };
    }
  }
  const action = filters.action?.trim();
  if (action) where.action = action.endsWith(".") ? { startsWith: action } : action;
  if (filters.entityType?.trim()) where.entityType = filters.entityType.trim();
  if (filters.entityId?.trim()) where.entityId = filters.entityId.trim();

  const at: Prisma.DateTimeFilter = {};
  if (isIsoDay(filters.from)) at.gte = startOfZonedDay(filters.from);
  if (isIsoDay(filters.to)) at.lt = zonedDayBounds(filters.to).end;
  if (at.gte || at.lt) where.at = at;
  return where;
}

async function labelActors(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, `${u.name} (${u.email})`]));
}

/** AC-6: newest first, server-side pagination (conventions: lists that can grow). */
export async function listAudit(
  filters: AuditFilters,
  page: number,
): Promise<{ rows: AuditRow[]; total: number; page: number; pageCount: number }> {
  const where = await buildWhere(filters);
  if (!where) return { rows: [], total: 0, page: 1, pageCount: 1 };
  const total = await db.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const entries = await db.auditLog.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    skip: (current - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
    select: {
      id: true,
      at: true,
      actorType: true,
      actorUserId: true,
      action: true,
      entityType: true,
      entityId: true,
    },
  });
  const labels = await labelActors([
    ...new Set(entries.flatMap((e) => (e.actorUserId ? [e.actorUserId] : []))),
  ]);
  return {
    total,
    page: current,
    pageCount,
    rows: entries.map((e) => ({
      id: e.id,
      at: e.at,
      actor: {
        type: e.actorType,
        userId: e.actorUserId,
        label: e.actorUserId ? (labels.get(e.actorUserId) ?? null) : null,
      },
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
    })),
  };
}

export type AuditDetail = AuditRow & {
  before: unknown;
  after: unknown;
  reason: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
};

export async function getAuditEntry(id: string): Promise<AuditDetail | null> {
  const e = await db.auditLog.findUnique({ where: { id } });
  if (!e) return null;
  const labels = await labelActors(e.actorUserId ? [e.actorUserId] : []);
  return {
    id: e.id,
    at: e.at,
    actor: {
      type: e.actorType,
      userId: e.actorUserId,
      label: e.actorUserId ? (labels.get(e.actorUserId) ?? null) : null,
    },
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
    reason: e.reason,
    requestId: e.requestId,
    ip: e.ip,
    userAgent: e.userAgent,
  };
}

/** AC-7: the latest entries of one entity, newest first. */
export async function auditForEntity(
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<AuditDetail[]> {
  const entries = await db.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: limit,
  });
  const labels = await labelActors([
    ...new Set(entries.flatMap((e) => (e.actorUserId ? [e.actorUserId] : []))),
  ]);
  return entries.map((e) => ({
    id: e.id,
    at: e.at,
    actor: {
      type: e.actorType,
      userId: e.actorUserId,
      label: e.actorUserId ? (labels.get(e.actorUserId) ?? null) : null,
    },
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
    reason: e.reason,
    requestId: e.requestId,
    ip: e.ip,
    userAgent: e.userAgent,
  }));
}
