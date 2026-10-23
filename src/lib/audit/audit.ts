import "server-only";
import type { AuditActorType } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { diffFields, type Fields } from "./diff";
import type { RequestContext } from "./request-context";

export type Actor = { type: "USER"; userId: string } | { type: "SYSTEM" } | { type: "PUBLIC" };

export type AuditEntry = {
  /** `<module>.<resource>.<verb>` */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Full entity fields before/after; null for create / delete. Only the diff is stored. */
  before?: Fields | null;
  after?: Fields | null;
  reason?: string | null;
};

export type Audit = (entry: AuditEntry) => Promise<void>;

const ACTION_FORMAT = /^[a-z]+\.[a-z_]+\.[a-z_]+$/;

/**
 * AC-2: binds the audit writer to the caller's transaction, so a rolled-back change leaves no
 * entry and a committed change always has one.
 */
export function createAuditor(
  tx: Pick<Tx, "auditLog">,
  actor: Actor,
  request?: RequestContext,
): Audit {
  return async (entry) => {
    if (!ACTION_FORMAT.test(entry.action))
      throw new Error(`Invalid audit action "${entry.action}"`);
    const diff = diffFields(entry.before, entry.after);
    const hasFields = entry.before != null || entry.after != null;
    // A pure update that changed nothing is not worth a row; creates, deletes and events
    // (no fields at all) always are.
    if (hasFields && diff === null) return;
    await tx.auditLog.create({
      data: {
        actorType: actor.type as AuditActorType,
        actorUserId: actor.type === "USER" ? actor.userId : null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: diff?.before ?? undefined,
        after: diff?.after ?? undefined,
        reason: entry.reason ?? null,
        requestId: request?.requestId ?? null,
        ip: request?.ip ?? null,
        userAgent: request?.userAgent ?? null,
      },
    });
  };
}
