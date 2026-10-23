// AC-2..AC-5: pure parsing / serialising of a table's URL state. Nothing here throws: bad input
// falls back to defaults so a mistyped or old link still renders a list.
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  RESERVED_PARAMS,
  type ColumnDef,
  type FilterDef,
  type SearchParams,
  type SortDir,
  type TableParams,
  type TableShape,
} from "./types";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function isIsoDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function parseFilter(def: FilterDef, raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (def.type === "date") return isIsoDay(value) ? value : undefined;
  if (def.type === "select") return def.options.some((o) => o.value === value) ? value : undefined;
  return value.slice(0, 200);
}

export function parseTableParams(search: SearchParams, shape: TableShape): TableParams {
  const sortable = new Set(shape.columns.filter((c) => c.sortable).map((c) => c.key));

  const [sortKey, sortDirRaw] = (first(search.sort) ?? "").split(":");
  const sort =
    sortKey && sortable.has(sortKey)
      ? { key: sortKey, dir: (sortDirRaw === "desc" ? "desc" : "asc") as SortDir }
      : shape.defaultSort;

  const sizeRaw = Number(first(search.size));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeRaw)
    ? sizeRaw
    : DEFAULT_PAGE_SIZE;

  const pageRaw = Math.floor(Number(first(search.page)));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, 1_000_000) : 1;

  const filters: Record<string, string> = {};
  for (const def of shape.filters) {
    const value = parseFilter(def, first(search[def.key]));
    if (value !== undefined) filters[def.key] = value;
  }

  const known = new Set(shape.columns.map((c) => c.key));
  // A GET form with several checkboxes sends `cols` repeatedly; a saved link sends "a,b".
  const colsRaw = Array.isArray(search.cols) ? search.cols.join(",") : (search.cols ?? "");
  const columns = [...new Set(colsRaw.split(",").filter((k) => known.has(k)))];

  return { page, pageSize, sort, filters, columns };
}

/** The columns to show, in definition order: chosen ones, else the defaults; "always" ones stay. */
export function visibleColumns(shape: TableShape, chosen: readonly string[]): ColumnDef[] {
  const wanted = new Set(chosen);
  return shape.columns.filter(
    (c) => c.alwaysVisible || (wanted.size > 0 ? wanted.has(c.key) : c.defaultVisible !== false),
  );
}

/** Only values that differ from the defaults, so URLs stay short and links stay canonical. */
export function toQueryString(
  params: TableParams,
  shape: TableShape,
  options: { page?: boolean; overrides?: Partial<Record<string, string | undefined>> } = {},
): string {
  const q = new URLSearchParams();
  for (const def of shape.filters) {
    const v = params.filters[def.key];
    if (v) q.set(def.key, v);
  }
  if (params.sort.key !== shape.defaultSort.key || params.sort.dir !== shape.defaultSort.dir) {
    q.set("sort", `${params.sort.key}:${params.sort.dir}`);
  }
  if (params.pageSize !== DEFAULT_PAGE_SIZE) q.set("size", String(params.pageSize));
  if (params.columns.length > 0) q.set("cols", params.columns.join(","));
  if (options.page && params.page > 1) q.set("page", String(params.page));
  for (const [k, v] of Object.entries(options.overrides ?? {})) {
    if (v === undefined) q.delete(k);
    else q.set(k, v);
  }
  return q.toString();
}

/** The next sort for a header click: asc, then desc, then asc again; a new column starts asc. */
export function nextSort(current: TableParams["sort"], key: string): TableParams["sort"] {
  if (current.key !== key) return { key, dir: "asc" };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

/** definition-time guard: filter keys must not collide with the paging/sort/column parameters. */
export function assertValidShape(shape: TableShape): void {
  const reserved = new Set<string>(RESERVED_PARAMS);
  const seen = new Set<string>();
  for (const f of shape.filters) {
    if (reserved.has(f.key)) throw new Error(`Filter key "${f.key}" is reserved`);
    if (seen.has(f.key)) throw new Error(`Duplicate filter key "${f.key}"`);
    seen.add(f.key);
  }
  const columnKeys = new Set<string>();
  for (const c of shape.columns) {
    if (columnKeys.has(c.key)) throw new Error(`Duplicate column key "${c.key}"`);
    columnKeys.add(c.key);
  }
  const sortable = shape.columns.find((c) => c.key === shape.defaultSort.key);
  if (!sortable?.sortable)
    throw new Error(`Default sort "${shape.defaultSort.key}" must be a sortable column`);
}

/** URLSearchParams -> the plain object parseTableParams expects (repeated keys become arrays). */
export function searchParamsToObject(params: URLSearchParams): SearchParams {
  const out: SearchParams = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}
