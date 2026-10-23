import type { ReactNode } from "react";
import { assertValidShape } from "./params";
import type { ExportValue } from "./export";
import type { Locale } from "@/lib/i18n/config";
import type { TableParams, TableShape } from "./types";

export type FetchContext = { user: { id: string } };

/** What value accessors and cell renderers get: the translator and locale of the viewer/exporter. */
export type CellContext = {
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: Locale;
};
export type FetchResult<Row> = { rows: Row[]; total: number };

/**
 * A list declared once (AC-1). `fetch` is the only place that touches data and it applies the
 * user's scope filter itself (conventions: every list query applies the scope); the framework
 * never builds queries.
 */
export type TableDef<Row = unknown> = TableShape & {
  /** Stable id used in URLs of the export route and for saved filters, e.g. "iam.users". */
  id: string;
  /** Read permission; the same check protects the page and the export. */
  permission: string;
  exportName: string;
  rowKey(row: Row): string;
  /** Plain value per column key: what is exported, and shown when no `cells` renderer exists. */
  values: Record<string, (row: Row, ctx: CellContext) => ExportValue>;
  /** Optional on-screen rendering per column key (links, badges). Not used by exports. */
  cells?: Record<string, (row: Row, ctx: CellContext) => ReactNode>;
  /**
   * NTF-03: makes the table a source for "Message these people": the person id of a row. The
   * recipients are exactly the rows `fetch` returns for the user (same permission, scope, filters).
   */
  recipient?(row: Row): string;
  /** `page`/`pageSize` are already validated; the export asks for one big page. */
  fetch(params: TableParams, ctx: FetchContext): Promise<FetchResult<Row>>;
};

const tables = new Map<string, TableDef<never>>();

export function defineTable<Row>(def: TableDef<Row>): TableDef<Row> {
  assertValidShape(def);
  for (const c of def.columns) {
    if (!def.values[c.key])
      throw new Error(`Table "${def.id}": column "${c.key}" has no value accessor`);
  }
  return def;
}

/** Makes the table known to the export route. Re-registering replaces (dev hot reload). */
export function registerTable<Row>(def: TableDef<Row>): TableDef<Row> {
  tables.set(def.id, def as unknown as TableDef<never>);
  return def;
}

export function getTable(id: string): TableDef<unknown> | undefined {
  return tables.get(id) as unknown as TableDef<unknown> | undefined;
}

export function resetTables(): void {
  tables.clear();
}
