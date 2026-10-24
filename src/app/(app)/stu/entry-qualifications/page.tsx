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
import { entryReport } from "@/modules/stu";

type Params = { program?: string; faculty?: string; cycle?: string };

const th = "p-3 font-semibold";

// STU-05 AC-1..AC-6: the high-school averages first-year students bring (SRC-022, Q-148).
export default async function EntryQualificationsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requireUser("/stu/entry-qualifications");
  if (!(await can(user, "stu.student.read"))) return <ForbiddenView />;
  const [t, p] = await Promise.all([getTranslations("stu.entry"), searchParams]);
  const tAny = t as unknown as (k: string) => string;
  const filters = { program: p.program ?? "", faculty: p.faculty ?? "", cycle: p.cycle ?? "" };
  const report = await entryReport(user, filters);
  const { summary } = report;
  const query = new URLSearchParams(filters).toString();
  const avg = (v: number) => v.toFixed(2);

  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 max-w-prose text-sm">{t("intro")}</p>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        {(["program", "faculty"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-1.5">
            <Label htmlFor={`e-${k}`}>{t(`${k}Code`)}</Label>
            <Input id={`e-${k}`} name={k} defaultValue={filters[k]} className="w-36" />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-cycle">{t("cycle")}</Label>
          <Select id="e-cycle" name="cycle" defaultValue={filters.cycle}>
            <option value="">{t("all")}</option>
            <option value="FIRST">{tAny("cycles.FIRST")}</option>
            <option value="SECOND">{tAny("cycles.SECOND")}</option>
          </Select>
        </div>
        <Button type="submit">{t("show")}</Button>
      </form>

      {summary.total === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("none")}</p>
      ) : (
        <>
          <dl
            data-testid="entry-summary"
            className="rounded-card border-border bg-card mb-6 grid grid-cols-2 gap-4 border p-4 text-sm sm:grid-cols-5"
          >
            {[
              ["total", String(summary.total)],
              ["withAverage", String(summary.withAverage)],
              ["withoutAverage", String(summary.withoutAverage)],
              ["mean", summary.overall ? avg(summary.overall.mean) : "-"],
              [
                "range",
                summary.overall ? `${avg(summary.overall.min)} - ${avg(summary.overall.max)}` : "-",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{tAny(`summary.${k}`)}</dt>
                <dd className="font-tabular text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mb-2 text-lg font-semibold">{t("distribution")}</h2>
          <div className="rounded-card border-border bg-card mb-6 overflow-x-auto border">
            <table className="w-full min-w-[24rem] text-sm">
              <caption className="sr-only">{t("distribution")}</caption>
              <thead>
                <tr className="border-border border-b text-left">
                  <th scope="col" className={th}>
                    {t("band")}
                  </th>
                  <th scope="col" className={th}>
                    {t("count")}
                  </th>
                  <th scope="col" className={th}>
                    {t("share")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.distribution.map((b) => (
                  <tr key={b.band} className="border-border border-b last:border-0">
                    <th scope="row" className="p-3 text-left font-semibold">
                      {tAny(`bands.${b.band}`)}
                    </th>
                    <td className="font-tabular p-3">{b.count}</td>
                    <td className="font-tabular p-3">{b.share.toFixed(1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 text-lg font-semibold">{t("byProgram")}</h2>
          <div className="rounded-card border-border bg-card mb-6 overflow-x-auto border">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">{t("byProgram")}</caption>
              <thead>
                <tr className="border-border border-b text-left">
                  {["program", "withAverage", "mean", "min", "max"].map((c) => (
                    <th key={c} scope="col" className={th}>
                      {tAny(`columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.programs.map((r) => (
                  <tr key={r.program} className="border-border border-b last:border-0">
                    <th scope="row" className="p-3 text-left font-semibold">
                      {r.program}
                    </th>
                    <td className="font-tabular p-3">{r.n}</td>
                    <td className="font-tabular p-3">{avg(r.mean)}</td>
                    <td className="font-tabular p-3">{avg(r.min)}</td>
                    <td className="font-tabular p-3">{avg(r.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 text-lg font-semibold">{t("list")}</h2>
          <div className="rounded-card border-border bg-card mb-4 overflow-x-auto border">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t("list")}</caption>
              <thead>
                <tr className="border-border border-b text-left">
                  {["studentNumber", "name", "program", "cohort", "school", "year", "average"].map(
                    (c) => (
                      <th key={c} scope="col" className={th}>
                        {tAny(`columns.${c}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr
                    key={r.studentNumber + r.program}
                    className="border-border border-b last:border-0"
                  >
                    <td className="font-tabular p-3">{r.studentNumber}</td>
                    <td className="p-3">{r.name}</td>
                    <td className="p-3">{r.program}</td>
                    <td className="p-3">{r.cohort}</td>
                    <td className="p-3">{r.schoolName ?? ""}</td>
                    <td className="font-tabular p-3">{r.graduationYear ?? ""}</td>
                    <td className="font-tabular p-3">
                      {r.average === null ? t("noAverage") : avg(r.average)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex flex-wrap gap-4 text-sm print:hidden">
            {(["list", "programs"] as const).flatMap((kind) =>
              (["xlsx", "csv"] as const).map((format) => (
                <Link
                  key={kind + format}
                  href={`/stu/entry-qualifications/export?${query}&kind=${kind}&format=${format}`}
                  className="underline"
                >
                  {tAny(`download.${kind}.${format}`)}
                </Link>
              )),
            )}
          </p>
        </>
      )}
    </>
  );
}
