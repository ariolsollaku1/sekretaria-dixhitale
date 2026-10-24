import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { PaymentImport } from "@/modules/fin";
import { getYear } from "@/modules/org";

// FIN-02 AC-7, AC-8: import payments of the selected academic year from a CSV/XLSX file.
export default async function ImportPaymentsPage() {
  const user = await requireUser("/fin/payments/import");
  if (!(await can(user, "fin.payment.write"))) return <ForbiddenView />;
  const [t, tp, yearId] = await Promise.all([
    getTranslations("fin.import"),
    getTranslations("fin.plan"),
    getSelectedAcademicYear(),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbs={[{ label: tp("plans"), href: "/fin/plans" }, { label: t("title") }]}
      />
      {year ? (
        <PaymentImport academicYearId={year.id} yearLabel={year.code} />
      ) : (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      )}
    </>
  );
}
