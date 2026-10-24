import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, SearchX } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/lib/i18n/config";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPlainDate,
} from "@/lib/i18n/format";
import type { TableDef } from "@/lib/tables/define";
import type { ExportValue } from "@/lib/tables/export";
import { nextSort, toQueryString, visibleColumns } from "@/lib/tables/params";
import type { TableResult } from "@/lib/tables/run";
import type { SavedFilterView } from "@/lib/tables/saved";
import { PAGE_SIZES, type ColumnDef } from "@/lib/tables/types";
import { DeleteSavedFilter, PrintButton, SaveFilterForm } from "./client";

function formatCell(
  value: ExportValue,
  column: ColumnDef,
  locale: Locale,
  yes: string,
  no: string,
): ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  switch (column.type) {
    case "number":
      return typeof value === "number" ? formatNumber(value, locale) : String(value);
    case "money":
      return formatMoney(value as number | string, locale);
    case "date":
      return typeof value === "string" || value instanceof Date
        ? formatPlainDateOrInstant(value, locale)
        : String(value);
    case "datetime":
      return value instanceof Date || typeof value === "string"
        ? formatDateTime(value, locale)
        : String(value);
    case "boolean":
      return value ? yes : no;
    default:
      return String(value);
  }
}

function formatPlainDateOrInstant(value: string | Date, locale: Locale): string {
  // `YYYY-MM-DD` strings are calendar days; Date objects are instants shown in Europe/Tirane.
  return typeof value === "string" ? formatPlainDate(value, locale) : formatDate(value, locale);
}

/**
 * AC-1..AC-6, AC-11, AC-12: renders one validated table result. Filters, sorting, paging and the
 * column chooser are plain links and GET forms, so they work without JavaScript and every state is
 * in the URL.
 */
export async function DataTable<Row>({
  def,
  result,
  basePath,
  saved,
  canSave,
}: {
  def: TableDef<Row>;
  result: TableResult<Row>;
  basePath: string;
  saved: SavedFilterView[];
  canSave: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const l = locale as Locale;
  const { params } = result;
  const columns = visibleColumns(def, params.columns);
  const cell = {
    t: (key: string, values?: Record<string, string | number>) => t(key as never, values as never),
    locale: l,
  };
  const href = (overrides: Record<string, string | undefined> = {}, page = false) => {
    const qs = toQueryString(params, def, { page, overrides });
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const filterQuery = toQueryString(params, def); // no page: what a saved filter stores
  const exportQuery = (format: string) => `format=${format}${filterQuery ? `&${filterQuery}` : ""}`;
  const hasFilters = Object.keys(params.filters).length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Filters: GET form, keeps sort / size / columns in hidden fields */}
      <form
        method="get"
        action={basePath}
        className="rounded-card bg-card ring-border grid gap-3 p-4 shadow-sm ring-1 sm:grid-cols-2 lg:grid-cols-4 print:hidden"
      >
        {def.filters.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`f-${f.key}`}>{t(f.labelKey as never)}</Label>
            {f.type === "select" ? (
              <Select id={`f-${f.key}`} name={f.key} defaultValue={params.filters[f.key] ?? ""}>
                <option value="">{t("table.all")}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey as never)}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={`f-${f.key}`}
                name={f.key}
                type={f.type === "date" ? "date" : "text"}
                defaultValue={params.filters[f.key] ?? ""}
              />
            )}
          </div>
        ))}
        {params.sort.key !== def.defaultSort.key || params.sort.dir !== def.defaultSort.dir ? (
          <input type="hidden" name="sort" value={`${params.sort.key}:${params.sort.dir}`} />
        ) : null}
        {params.pageSize !== 25 ? (
          <input type="hidden" name="size" value={params.pageSize} />
        ) : null}
        {params.columns.length > 0 ? (
          <input type="hidden" name="cols" value={params.columns.join(",")} />
        ) : null}
        <div className="flex items-end gap-2">
          <Button type="submit">{t("table.apply")}</Button>
          {hasFilters && (
            <Link
              href={href(Object.fromEntries(def.filters.map((f) => [f.key, undefined])))}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("table.clear")}
            </Link>
          )}
        </div>
      </form>

      {/* Saved filters (AC-6) */}
      {canSave && (
        <section
          aria-labelledby={`${def.id}-saved`}
          className="rounded-card bg-card ring-border p-4 shadow-sm ring-1 print:hidden"
        >
          <h2 id={`${def.id}-saved`} className="mb-2 font-semibold">
            {t("table.saved.title")}
          </h2>
          {saved.length === 0 ? (
            <p className="text-muted-foreground mb-3 text-sm">{t("table.saved.none")}</p>
          ) : (
            <ul className="mb-3 flex flex-wrap gap-2">
              {saved.map((s) => (
                <li
                  key={s.id}
                  className="rounded-control border-border flex items-center border pl-3"
                >
                  <Link href={s.query ? `${basePath}?${s.query}` : basePath} className="underline">
                    {s.name}
                  </Link>
                  <DeleteSavedFilter id={s.id} name={s.name} path={basePath} />
                </li>
              ))}
            </ul>
          )}
          <SaveFilterForm tableId={def.id} query={filterQuery} path={basePath} />
        </section>
      )}

      {/* Toolbar: count, column chooser, exports, print */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {t("table.count", { count: result.total })}
        </p>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <details className="relative">
            <summary
              className={`${buttonVariants({ variant: "secondary" })} cursor-pointer list-none`}
            >
              <Columns3 aria-hidden /> {t("table.columns")}
            </summary>
            <form
              method="get"
              action={basePath}
              className="rounded-card border-border bg-popover absolute right-0 z-10 mt-2 flex w-64 flex-col gap-2 border p-4 shadow-lg"
            >
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 font-semibold">{t("table.chooseColumns")}</legend>
                {def.columns.map((c) => (
                  <label key={c.key} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="cols"
                      value={c.key}
                      defaultChecked={columns.some((v) => v.key === c.key)}
                      disabled={c.alwaysVisible}
                      className="size-4"
                    />
                    {t(c.labelKey as never)}
                  </label>
                ))}
              </fieldset>
              {Object.entries(params.filters).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              {params.sort.key !== def.defaultSort.key ||
              params.sort.dir !== def.defaultSort.dir ? (
                <input type="hidden" name="sort" value={`${params.sort.key}:${params.sort.dir}`} />
              ) : null}
              {params.pageSize !== 25 ? (
                <input type="hidden" name="size" value={params.pageSize} />
              ) : null}
              <Button type="submit">{t("table.apply")}</Button>
            </form>
          </details>
          <a
            href={`/api/tables/${def.id}/export?${exportQuery("xlsx")}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <Download aria-hidden /> {t("table.exportXlsx")}
          </a>
          <a
            href={`/api/tables/${def.id}/export?${exportQuery("csv")}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <Download aria-hidden /> {t("table.exportCsv")}
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Results */}
      {result.rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t("table.empty")}
          description={hasFilters ? t("table.emptyFiltered") : undefined}
        />
      ) : (
        <div className="rounded-card bg-card ring-border overflow-x-auto shadow-sm ring-1">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-[13px] tracking-wide uppercase">
                {columns.map((c) => {
                  const active = params.sort.key === c.key;
                  const ariaSort = !c.sortable
                    ? undefined
                    : active
                      ? params.sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none";
                  const next = nextSort(params.sort, c.key);
                  return (
                    <th key={c.key} scope="col" aria-sort={ariaSort} className="p-3 font-semibold">
                      {c.sortable ? (
                        <Link
                          href={href({ sort: `${next.key}:${next.dir}`, page: undefined })}
                          className="inline-flex items-center gap-1 underline-offset-2 hover:underline print:no-underline"
                        >
                          {t(c.labelKey as never)}
                          {active ? (
                            params.sort.dir === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : (
                              <ArrowDown className="size-3.5" aria-hidden />
                            )
                          ) : (
                            <ChevronsUpDown
                              className="text-muted-foreground size-3.5 print:hidden"
                              aria-hidden
                            />
                          )}
                        </Link>
                      ) : (
                        t(c.labelKey as never)
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr
                  key={def.rowKey(row)}
                  className="border-border hover:bg-accent/60 border-b transition-colors last:border-0"
                >
                  {columns.map((c, i) => {
                    const custom = def.cells?.[c.key];
                    const content = custom
                      ? custom(row, cell)
                      : formatCell(
                          def.values[c.key]!(row, cell),
                          c,
                          l,
                          t("common.yes"),
                          t("common.no"),
                        );
                    const numeric = c.type === "number" || c.type === "money";
                    return i === 0 ? (
                      <th key={c.key} scope="row" className="p-3 text-left font-semibold">
                        {content}
                      </th>
                    ) : (
                      <td
                        key={c.key}
                        className={`p-3 ${numeric ? "font-tabular text-right" : c.type === "date" || c.type === "datetime" ? "font-tabular whitespace-nowrap" : "break-words"}`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <nav
        className="flex flex-wrap items-center justify-between gap-3 print:hidden"
        aria-label={t("table.pagination")}
      >
        <div className="flex items-center gap-2">
          {params.page > 1 ? (
            <Link
              href={href({ page: String(params.page - 1) })}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("table.previous")}
            </Link>
          ) : null}
          <span className="text-sm">
            {t("table.page", { page: params.page, pageCount: result.pageCount })}
          </span>
          {params.page < result.pageCount ? (
            <Link
              href={href({ page: String(params.page + 1) })}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("table.next")}
            </Link>
          ) : null}
        </div>
        <ul className="flex items-center gap-1 text-sm" aria-label={t("table.pageSize")}>
          {PAGE_SIZES.map((s) => (
            <li key={s}>
              <Link
                href={href({ size: s === 25 ? undefined : String(s), page: undefined })}
                aria-current={s === params.pageSize ? "true" : undefined}
                className={`rounded-control inline-flex min-h-11 min-w-11 items-center justify-center px-2 ${s === params.pageSize ? "bg-brand-gradient text-primary-foreground font-semibold" : "hover:bg-accent"}`}
              >
                {s}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
