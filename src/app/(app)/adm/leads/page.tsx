import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { TablePage } from "@/components/table/table-page";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { SearchParams } from "@/lib/tables/types";
import { ImportLeads, LeadForm, leadsTable, listLeadProgramOptions } from "@/modules/adm";

// ADM-01 AC-3..AC-5: the leads list; the Secretariat and Student Affairs also add and import leads.
export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/adm/leads");
  if (!(await can(user, "adm.lead.read"))) return <ForbiddenView />;
  const [t, search, mayWrite] = await Promise.all([
    getTranslations("adm.leads"),
    searchParams,
    can(user, "adm.lead.write"),
  ]);
  const programs = mayWrite ? await listLeadProgramOptions() : [];
  return (
    <>
      <PageHeader title={t("title")} />
      {mayWrite && (
        <div className="mb-6 flex flex-col gap-3 print:hidden">
          <details className="rounded-card border-border border p-4">
            <summary className="cursor-pointer text-base font-semibold">{t("addTitle")}</summary>
            <div className="mt-4">
              <LeadForm programs={programs} />
            </div>
          </details>
          <details className="rounded-card border-border border p-4">
            <summary className="cursor-pointer text-base font-semibold">{t("importTitle")}</summary>
            <div className="mt-4">
              <ImportLeads />
            </div>
          </details>
        </div>
      )}
      <TablePage def={leadsTable} search={search} user={user} basePath="/adm/leads" />
    </>
  );
}
