import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  DIMENSIONS,
  STAT_TRANSLATED,
  isDimension,
  pivot,
  statRecords,
  type Dimension,
} from "@/modules/stu";

type Params = {
  rows?: string;
  cols?: string;
  status?: string;
  program?: string;
  faculty?: string;
  cycle?: string;
};

// STU-04 AC-1/AC-2: counts of enrollments by two chosen dimensions.
export default async function StatisticsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/stu/statistics");
  if (!(await can(user, "stu.student.read"))) return <ForbiddenView />;
  const [t, p] = await Promise.all([getTranslations("stu.stats"), searchParams]);
  const tAny = t as unknown as (k: string) => string;
  const rowDim: Dimension = isDimension(p.rows) ? p.rows : "program";
  const colDim: Dimension | null = isDimension(p.cols) ? p.cols : "gender";
  const filters = {
    status: p.status ?? "ACTIVE",
    program: p.program ?? "",
    faculty: p.faculty ?? "",
    cycle: p.cycle ?? "",
  };
  const records = await statRecords(user, filters);
  const result = pivot(records, rowDim, colDim);
  const label = (dim: Dimension, value: string) => {
    if (value === "") return t("empty");
    const ns = STAT_TRANSLATED[dim];
    return ns ? tAny(`values.${dim}.${value}`) : value;
  };
  const query = new URLSearchParams({
    rows: rowDim,
    ...(colDim ? { cols: colDim } : {}),
    ...filters,
  }).toString();
  const single = result.cols.length === 0;

  return (
    <>
      <PageHeader title={t("title")} />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        {(
          [
            ["rows", rowDim],
            ["cols", colDim ?? rowDim],
          ] as const
        ).map(([name, value]) => (
          <div key={name} className="flex flex-col gap-1.5">
            <Label htmlFor={`s-${name}`}>{t(name)}</Label>
            <Select id={`s-${name}`} name={name} defaultValue={value}>
              {DIMENSIONS.map((d) => (
                <option key={d} value={d}>
                  {tAny(`dimensions.${d}`)}
                </option>
              ))}
            </Select>
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-status">{t("status")}</Label>
          <Select id="s-status" name="status" defaultValue={filters.status}>
            {["ACTIVE", "SUSPENDED", "DEREGISTERED", "GRADUATED"].map((s) => (
              <option key={s} value={s}>
                {tAny(`values.status.${s}`)}
              </option>
            ))}
            <option value="all">{t("allStatuses")}</option>
          </Select>
        </div>
        {(["program", "faculty"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-1.5">
            <Label htmlFor={`s-${k}`}>{t(`${k}Code`)}</Label>
            <Input id={`s-${k}`} name={k} defaultValue={filters[k]} className="w-36" />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-cycle">{t("cycle")}</Label>
          <Select id="s-cycle" name="cycle" defaultValue={filters.cycle}>
            <option value="">{t("all")}</option>
            <option value="FIRST">{tAny("values.cycle.FIRST")}</option>
            <option value="SECOND">{tAny("values.cycle.SECOND")}</option>
          </Select>
        </div>
        <Button type="submit">{t("show")}</Button>
      </form>

      {result.total === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("none")}</p>
      ) : (
        <>
          <div className="rounded-card border-border bg-card mb-4 overflow-x-auto border">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">{t("title")}</caption>
              <thead>
                <tr className="border-border border-b text-left">
                  <th scope="col" className="p-3 font-semibold">
                    {tAny(`dimensions.${rowDim}`)}
                  </th>
                  {single ? (
                    <th scope="col" className="p-3 font-semibold">
                      {t("count")}
                    </th>
                  ) : (
                    <>
                      {result.cols.map((c) => (
                        <th key={c} scope="col" className="p-3 font-semibold">
                          {label(colDim!, c)}
                        </th>
                      ))}
                      <th scope="col" className="p-3 font-semibold">
                        {t("total")}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r} className="border-border border-b last:border-0">
                    <th scope="row" className="p-3 text-left font-semibold">
                      {label(rowDim, r)}
                    </th>
                    {single ? (
                      <td className="font-tabular p-3">{result.rowTotal(r)}</td>
                    ) : (
                      <>
                        {result.cols.map((c) => (
                          <td key={c} className="font-tabular p-3">
                            {result.cell(r, c)}
                          </td>
                        ))}
                        <td className="font-tabular p-3 font-semibold">{result.rowTotal(r)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              {!single && (
                <tfoot>
                  <tr className="border-border border-t">
                    <th scope="row" className="p-3 text-left font-semibold">
                      {t("total")}
                    </th>
                    {result.cols.map((c) => (
                      <td key={c} className="font-tabular p-3 font-semibold">
                        {result.colTotal(c)}
                      </td>
                    ))}
                    <td className="font-tabular p-3 font-semibold">{result.total}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="flex gap-4 text-sm print:hidden">
            <Link href={`/stu/statistics/export?${query}&format=xlsx`} className="underline">
              {t("downloadXlsx")}
            </Link>
            <Link href={`/stu/statistics/export?${query}&format=csv`} className="underline">
              {t("downloadCsv")}
            </Link>
          </p>
        </>
      )}
    </>
  );
}
