"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { logger } from "@/lib/logger";
import { hit } from "@/lib/ratelimit";
import { allSearchSources, MAX_QUERY, runSearch, type SearchGroup } from "./registry";
import "./sources";

const input = z.object({ query: z.string().max(MAX_QUERY) });

export type SearchResult =
  | { ok: true; groups: SearchGroup[] }
  | { ok: false; error: "UNAUTHENTICATED" | "RATE_LIMITED" | "INVALID" };

// AC-6: 30 searches per 10 s per user is far above typing speed with debounce.
const LIMIT = { limit: 30, windowMs: 10_000 };

/**
 * PLT-16: read-only search. No audit row (nothing changes) and the query is never logged (AC-8);
 * each source applies its own permission and scope.
 */
export async function searchAction(raw: unknown): Promise<SearchResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };
  if (!(await hit(`search:${user.id}`, LIMIT)).allowed) return { ok: false, error: "RATE_LIMITED" };
  const groups = await runSearch(parsed.data.query, user, {
    can,
    sources: allSearchSources(),
    onError: (sourceId) => logger.error("search source failed", { sourceId }),
  });
  return { ok: true, groups };
}
