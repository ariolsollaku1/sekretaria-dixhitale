import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { toCsv, toXlsx, type ExportColumn, type ExportRow } from "@/lib/tables/export";
import { entryReport } from "@/modules/stu";

export const dynamic = "force-dynamic";

// STU-05 AC-6: the name list or the per-program summary as Excel or CSV (formula-injection guarded by the exporters).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!(await can(user, "stu.student.read"))) return new Response(null, { status: 403 });
  const q = new URL(request.url).searchParams;
  const report = await entryReport(user, {
    program: q.get("program") ?? "",
    faculty: q.get("faculty") ?? "",
    cycle: q.get("cycle") ?? "",
  });
  const t = (await getTranslations("stu.entry")) as unknown as (k: string) => string;
  const programs = q.get("kind") === "programs";
  const num = (key: string) => ({ key, label: t(`columns.${key}`), type: "number" as const });
  const text = (key: string) => ({ key, label: t(`columns.${key}`), type: "text" as const });
  const columns: ExportColumn[] = programs
    ? [text("program"), num("withAverage"), num("mean"), num("min"), num("max")]
    : [
        text("studentNumber"),
        text("name"),
        text("program"),
        text("cohort"),
        text("school"),
        num("year"),
        num("average"),
      ];
  const rows: ExportRow[] = programs
    ? report.programs.map((r) => ({
        program: r.program,
        withAverage: r.n,
        mean: r.mean,
        min: r.min,
        max: r.max,
      }))
    : report.rows.map((r) => ({
        studentNumber: r.studentNumber,
        name: r.name,
        program: r.program,
        cohort: r.cohort,
        school: r.schoolName,
        year: r.graduationYear,
        average: r.average,
      }));
  const xlsx = q.get("format") !== "csv";
  const body = xlsx ? toXlsx(columns, rows, "Entry") : toCsv(columns, rows);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": xlsx
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="entry-qualifications-${programs ? "programs" : "list"}.${xlsx ? "xlsx" : "csv"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
