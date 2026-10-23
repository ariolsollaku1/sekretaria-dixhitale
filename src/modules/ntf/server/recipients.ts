import "server-only";
import { DomainError } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import { getTable } from "@/lib/tables/define";
import { parseTableParams } from "@/lib/tables/params";
import type { SearchParams } from "@/lib/tables/types";
import { MAX_RECIPIENTS } from "../domain/message-schemas";

export type ResolvedRecipients = {
  tableId: string;
  /** The validated filters of the list (what is stored with the message). */
  filters: Record<string, string>;
  personIds: string[];
};

/** Tables are registered by importing the modules; loaded lazily to avoid an import cycle. */
async function findSource(tableId: string) {
  await import("@/lib/tables/all");
  const def = getTable(tableId);
  if (!def || !def.recipient) throw new DomainError("NOT_FOUND", "Unknown list");
  return def;
}

/**
 * AC-2: the people of a list exactly as the user sees it - the table's own permission, scope and
 * filters, no paging - refused when empty or above the cap (Q-51).
 */
export async function resolveRecipients(
  user: { id: string },
  tableId: string,
  filters: Record<string, string>,
): Promise<ResolvedRecipients> {
  const def = await findSource(tableId);
  if (!(await can(user, def.permission))) throw new ForbiddenError(def.permission);
  const params = {
    ...parseTableParams(filters as SearchParams, def),
    page: 1,
    pageSize: MAX_RECIPIENTS + 1,
  };
  const { rows, total } = await def.fetch(params, { user });
  const personIds = [...new Set(rows.map((r) => def.recipient!(r as never)))];
  if (total > MAX_RECIPIENTS || rows.length > MAX_RECIPIENTS)
    throw new DomainError("VALIDATION", "Too many recipients", { recipients: ["tooMany"] });
  if (personIds.length === 0)
    throw new DomainError("VALIDATION", "No recipients", { recipients: ["noRecipients"] });
  return { tableId, filters: params.filters, personIds };
}

/** Label key of a source list (shown in the log); unknown ids fall back to the id. */
export async function sourceExportName(tableId: string): Promise<string> {
  await import("@/lib/tables/all");
  return getTable(tableId)?.exportName ?? tableId;
}
