import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { GrantScholarshipForm, listOpenYearOptions, scholarshipsTable } from "@/modules/fin";

// FIN-03 SRC-083: students with scholarships and their fees; Finance can also grant one directly.
export default async function ScholarshipsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/fin/scholarships");
  if (!(await can(user, "fin.scholarship.read"))) return <ForbiddenView />;
  const [t, search, yearId, mayWrite] = await Promise.all([
    getTranslations("fin.scholarship"),
    searchParams,
    getSelectedAcademicYear(),
    can(user, "fin.scholarship.write"),
  ]);
  const years = mayWrite ? await listOpenYearOptions() : [];
  const defaultYear = years.find((y) => y.id === yearId)?.id ?? years[0]?.id ?? "";
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="mb-4 text-sm">
        <Link href="/fin/scholarships/report" className="underline">
          {t("reportLink")}
        </Link>
      </p>
      {mayWrite && (
        <GrantScholarshipForm
          years={years}
          defaultYearId={defaultYear}
          heading={t("form.directTitle")}
        />
      )}
      {!yearId && (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      )}
      <TablePage def={scholarshipsTable} search={search} user={user} basePath="/fin/scholarships" />
    </>
  );
}
