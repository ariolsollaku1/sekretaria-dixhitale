import "server-only";
import { createAuditor, getRequestContext } from "@/lib/audit";
import { can as canDefault } from "@/lib/authz/guard";
import { ForbiddenError } from "@/lib/authz/check";
import { db } from "@/lib/db";
import { toCsv, toXlsx, type ExportColumn, type ExportRow } from "./export";
import type { Locale } from "@/lib/i18n/config";
import type { TableDef } from "./define";
import { parseTableParams, visibleColumns } from "./params";
import { EXPORT_MAX_ROWS, type SearchParams, type TableParams } from "./types";

type User = { id: string };
type Can = (user: User, permission: string) => Promise<boolean>;

export type TableResult<Row> = {
  params: TableParams;
  rows: Row[];
  total: number;
  pageCount: number;
};

/** AC-2/AC-3/AC-8: validate the URL state, check the permission, fetch one page (clamped). */
export async function runTable<Row>(
  def: TableDef<Row>,
  search: SearchParams,
  user: User,
  can: Can = canDefault,
): Promise<TableResult<Row>> {
  if (!(await can(user, def.permission))) throw new ForbiddenError(def.permission);
  const params = parseTableParams(search, def);
  let result = await def.fetch(params, { user });
  const pageCount = Math.max(1, Math.ceil(result.total / params.pageSize));
  if (params.page > pageCount) {
    params.page = pageCount;
    result = await def.fetch(params, { user });
  }
  return { params, rows: result.rows, total: result.total, pageCount };
}

export class ExportTooLargeError extends Error {
  constructor(readonly total: number) {
    super(`Export has ${total} rows (max ${EXPORT_MAX_ROWS})`);
    this.name = "ExportTooLargeError";
  }
}

export type ExportFormat = "xlsx" | "csv";

export const EXPORT_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

/**
 * AC-7..AC-10: the same permission, scope and filters as the list, no paging (one big page), the
 * visible columns, translated headers; refused above the row cap; always audited (no row data).
 */
export async function runExport<Row>(
  def: TableDef<Row>,
  search: SearchParams,
  user: User,
  format: ExportFormat,
  translate: (key: string, values?: Record<string, string | number>) => string,
  deps: { can?: Can; now?: Date; locale?: Locale } = {},
) {
  if (!(await (deps.can ?? canDefault)(user, def.permission)))
    throw new ForbiddenError(def.permission);
  const params = { ...parseTableParams(search, def), page: 1, pageSize: EXPORT_MAX_ROWS + 1 };
  const { rows, total } = await def.fetch(params, { user });
  if (total > EXPORT_MAX_ROWS) throw new ExportTooLargeError(total);

  const columns = visibleColumns(def, params.columns);
  const exportColumns: ExportColumn[] = columns.map((c) => ({
    key: c.key,
    label: translate(c.labelKey),
    type: c.type,
  }));
  const cell = { t: translate, locale: deps.locale ?? ("sq" as Locale) };
  const data: ExportRow[] = rows.map((row) =>
    Object.fromEntries(columns.map((c) => [c.key, def.values[c.key]!(row, cell)])),
  );
  const bytes =
    format === "xlsx" ? toXlsx(exportColumns, data, def.exportName) : toCsv(exportColumns, data);

  const request = await getRequestContext();
  await createAuditor(
    db,
    { type: "USER", userId: user.id },
    request,
  )({
    action: "plt.export.run",
    entityType: "Table",
    entityId: def.id,
    after: {
      format,
      rows: rows.length,
      filters: params.filters,
      sort: `${params.sort.key}:${params.sort.dir}`,
      columns: columns.map((c) => c.key),
    },
  });

  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Tirane" }).format(
    deps.now ?? new Date(),
  );
  return {
    bytes,
    contentType: EXPORT_TYPES[format],
    fileName: `${def.exportName}-${day}.${format}`,
    rows: rows.length,
  };
}
