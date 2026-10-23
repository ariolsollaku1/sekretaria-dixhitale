// Shapes shared by the pure table logic, the server runner and the UI.
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
/** Working assumption (spec): exports above this are refused with "narrow the filters". */
export const EXPORT_MAX_ROWS = 50_000;
export const MAX_SAVED_FILTERS = 20;
export const RESERVED_PARAMS = ["page", "size", "sort", "cols"] as const;

export type SortDir = "asc" | "desc";
export type ColumnType = "text" | "number" | "date" | "datetime" | "money" | "boolean";

export type ColumnDef = {
  key: string;
  /** Full catalog key of the header, e.g. "iam.columns.name". */
  labelKey: string;
  type: ColumnType;
  sortable?: boolean;
  /** Shown when the user has not chosen columns (default true). */
  defaultVisible?: boolean;
  /** Cannot be hidden in the chooser (e.g. the name that links to the record). */
  alwaysVisible?: boolean;
};

export type FilterDef =
  | { key: string; labelKey: string; type: "text" }
  | { key: string; labelKey: string; type: "date" }
  | {
      key: string;
      labelKey: string;
      type: "select";
      options: { value: string; labelKey: string }[];
    };

export type TableShape = {
  columns: ColumnDef[];
  filters: FilterDef[];
  defaultSort: { key: string; dir: SortDir };
};

export type TableParams = {
  page: number;
  pageSize: number;
  sort: { key: string; dir: SortDir };
  /** Validated filter values only; absent = not filtered. */
  filters: Record<string, string>;
  /** Chosen column keys, empty = the defaults. */
  columns: string[];
};

export type SearchParams = Record<string, string | string[] | undefined>;
