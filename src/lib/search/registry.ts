import type { Permission } from "@/lib/authz/types";

// PLT-16: modules contribute searchable record types. A source never builds its own access rule:
// it declares the read permission of its list and runs the same scope-filtered query.

export type SearchHit = { id: string; title: string; subtitle?: string; href: string };

export type SearchSource = {
  id: string;
  /** Key under `shell.search.groups` for the group heading. */
  groupKey: string;
  permission: Permission;
  run(query: string, user: { id: string }): Promise<SearchHit[]>;
};

export type SearchGroup = { id: string; groupKey: string; hits: SearchHit[] };

export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
export const HITS_PER_GROUP = 5;

const sources = new Map<string, SearchSource>();

export function registerSearchSource(...list: SearchSource[]): void {
  for (const s of list) sources.set(s.id, s); // re-registering replaces (dev hot reload)
}

export const allSearchSources = (): SearchSource[] => [...sources.values()];

export function resetSearchSources(): void {
  sources.clear();
}

export type SearchDeps = {
  can(user: { id: string }, permission: Permission): Promise<boolean>;
  sources: readonly SearchSource[];
  /** Called with the source id only (never the query or a result) when a source throws. */
  onError?(sourceId: string): void;
};

/**
 * AC-3..AC-5: sources the user may read run in parallel; one that throws is omitted. Groups keep
 * registration order and are dropped when empty.
 */
export async function runSearch(
  query: string,
  user: { id: string },
  deps: SearchDeps,
): Promise<SearchGroup[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY || q.length > MAX_QUERY) return [];
  const groups = await Promise.all(
    deps.sources.map(async (s): Promise<SearchGroup | null> => {
      try {
        if (!(await deps.can(user, s.permission))) return null;
        const hits = (await s.run(q, user)).slice(0, HITS_PER_GROUP);
        return hits.length ? { id: s.id, groupKey: s.groupKey, hits } : null;
      } catch {
        deps.onError?.(s.id);
        return null;
      }
    }),
  );
  return groups.filter((g): g is SearchGroup => g !== null);
}
