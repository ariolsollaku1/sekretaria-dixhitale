import "server-only";
import type { TableDef } from "@/lib/tables/define";
import { HITS_PER_GROUP, type SearchHit, type SearchSource } from "./registry";

/**
 * A source backed by a registered list: it calls the list's own `fetch` (which applies the user's
 * scope) with one filter and a page of five, so search can never show more than the list would.
 * Several filter sets are merged and de-duplicated (e.g. applications: by name and by reference).
 */
export function tableSource<Row>(o: {
  id: string;
  groupKey: string;
  table: TableDef<Row>;
  filters(query: string): Record<string, string>[];
  hit(row: Row): SearchHit;
}): SearchSource {
  return {
    id: o.id,
    groupKey: o.groupKey,
    permission: o.table.permission,
    async run(query, user) {
      const pages = await Promise.all(
        o.filters(query).map((filters) =>
          o.table.fetch(
            {
              page: 1,
              pageSize: HITS_PER_GROUP,
              sort: o.table.defaultSort,
              filters,
              columns: [],
            },
            { user },
          ),
        ),
      );
      const seen = new Map<string, SearchHit>();
      for (const page of pages)
        for (const row of page.rows) {
          const hit = o.hit(row);
          if (!seen.has(hit.id)) seen.set(hit.id, hit);
        }
      return [...seen.values()].slice(0, HITS_PER_GROUP);
    },
  };
}
