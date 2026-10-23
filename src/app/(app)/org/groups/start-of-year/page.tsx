import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import {
  StartOfYearForm,
  getCurrentAcademicYear,
  getYear,
  listYearOptions,
  previewStartOfYear,
} from "@/modules/org";

// AC-9: pick a year, see which groups would be created, confirm.
export default async function StartOfYearPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser("/org/groups/start-of-year");
  if (!(await can(user, "org.group.write"))) return <ForbiddenView />;
  const [t, years, current, params] = await Promise.all([
    getTranslations("org.group.startOfYear"),
    listYearOptions(),
    getCurrentAcademicYear(),
    searchParams,
  ]);
  const yearId = years.some((y) => y.id === params.year)
    ? params.year!
    : (current?.id ?? years[0]?.id ?? "");
  const year = yearId ? await getYear(yearId) : null;
  const preview = year && year.status !== "CLOSED" ? await previewStartOfYear(yearId, db) : [];
  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbs={[{ label: t("groups"), href: "/org/groups" }, { label: t("title") }]}
      />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="year">{t("year")}</Label>
          <Select id="year" name="year" defaultValue={yearId}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          {t("show")}
        </Button>
      </form>
      {year?.status === "CLOSED" ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("closed")}</p>
      ) : preview.length === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("nothing")}</p>
      ) : (
        <>
          <p className="mb-3 text-sm">{t("intro", { count: preview.length })}</p>
          <div className="rounded-card border-border bg-card mb-6 overflow-x-auto border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-border border-b text-left">
                  <th scope="col" className="p-3 font-semibold">
                    {t("columns.program")}
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    {t("columns.cohort")}
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    {t("columns.yearOfStudy")}
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    {t("columns.name")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.map((g) => (
                  <tr
                    key={`${g.cohortId}-${g.yearOfStudy}`}
                    className="border-border border-b last:border-0"
                  >
                    <th scope="row" className="p-3 text-left font-semibold">
                      {g.programCode}
                    </th>
                    <td className="p-3">{g.cohortName}</td>
                    <td className="font-tabular p-3">{g.yearOfStudy}</td>
                    <td className="p-3">{g.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <StartOfYearForm yearId={yearId} count={preview.length} />
        </>
      )}
    </>
  );
}
