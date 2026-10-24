import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { GeneratePlansForm, listProgramOptions, plansTable } from "@/modules/fin";
import { getYear } from "@/modules/org";

// FIN-01 AC-6, AC-10: payment plans of the selected year; Finance generates them here.
export default async function PlansPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/fin/plans");
  if (!(await can(user, "fin.plan.read"))) return <ForbiddenView />;
  const [t, search, yearId, mayWrite, mayWritePay] = await Promise.all([
    getTranslations("fin.plans"),
    searchParams,
    getSelectedAcademicYear(),
    can(user, "fin.plan.write"),
    can(user, "fin.payment.write"),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  const programs = mayWrite && year ? await listProgramOptions(user, "fin.plan.read") : [];
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWritePay ? (
            <Link href="/fin/payments/import" className="text-sm underline">
              {t("importPayments")}
            </Link>
          ) : undefined
        }
      />
      {!year && (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      )}
      {year && mayWrite && year.status !== "CLOSED" && (
        <GeneratePlansForm academicYearId={year.id} yearLabel={year.code} programs={programs} />
      )}
      <TablePage def={plansTable} search={search} user={user} basePath="/fin/plans" />
    </>
  );
}
