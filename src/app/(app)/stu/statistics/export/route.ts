import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { toCsv, toXlsx, type ExportColumn, type ExportRow } from "@/lib/tables/export";
import { STAT_TRANSLATED, isDimension, pivot, statRecords, type Dimension } from "@/modules/stu";

export const dynamic = "force-dynamic";

// STU-04 AC-3/AC-4: the same counts as the page, as Excel or CSV (formula-injection guarded by the exporters).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!(await can(user, "stu.student.read"))) return new Response(null, { status: 403 });
  const url = new URL(request.url);
  const q = url.searchParams;
  const rowDim: Dimension = isDimension(q.get("rows")) ? (q.get("rows") as Dimension) : "program";
  const colDim: Dimension | null = isDimension(q.get("cols")) ? (q.get("cols") as Dimension) : null;
  const records = await statRecords(user, {
    status: q.get("status") ?? "ACTIVE",
    program: q.get("program") ?? "",
    faculty: q.get("faculty") ?? "",
    cycle: q.get("cycle") ?? "",
  });
  const result = pivot(records, rowDim, colDim);
  const t = (await getTranslations("stu.stats")) as unknown as (k: string) => string;
  const label = (dim: Dimension, v: string) =>
    v === "" ? t("empty") : STAT_TRANSLATED[dim] ? t(`values.${dim}.${v}`) : v;
  const single = result.cols.length === 0;
  const columns: ExportColumn[] = [
    { key: "row", label: t(`dimensions.${rowDim}`), type: "text" },
    ...(single
      ? [{ key: "n", label: t("count"), type: "number" as const }]
      : [
          ...result.cols.map((c, i) => ({
            key: `c${i}`,
            label: label(colDim!, c),
            type: "number" as const,
          })),
          { key: "total", label: t("total"), type: "number" as const },
        ]),
  ];
  const rows: ExportRow[] = result.rows.map((r) =>
    single
      ? { row: label(rowDim, r), n: result.rowTotal(r) }
      : {
          row: label(rowDim, r),
          ...Object.fromEntries(result.cols.map((c, i) => [`c${i}`, result.cell(r, c)])),
          total: result.rowTotal(r),
        },
  );
  const xlsx = q.get("format") !== "csv";
  const body = xlsx ? toXlsx(columns, rows, "Statistics") : toCsv(columns, rows);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": xlsx
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="student-statistics.${xlsx ? "xlsx" : "csv"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
