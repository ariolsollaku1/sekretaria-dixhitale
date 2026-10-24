import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { BulkEnroll, listEnrollable, listEnrollPrograms, placementOptions } from "@/modules/adm";

// ADM-04 AC-1, AC-7, AC-8: bulk enrollment of the applications waiting for the final approval.
export default async function EnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const user = await requireUser("/adm/enrollment");
  if (!(await can(user, "adm.application.enroll"))) return <ForbiddenView />;
  const [t, search, programs] = await Promise.all([
    getTranslations("adm.enroll"),
    searchParams,
    listEnrollPrograms(),
  ]);
  const programId = programs.find((p) => p.id === search.program)?.id ?? programs[0]?.id ?? null;
  const [rows, options] = programId
    ? await Promise.all([listEnrollable(programId), placementOptions(programId)])
    : [[], { cohorts: [] }];
  return (
    <>
      <PageHeader title={t("pageTitle")} />
      {programs.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("none")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <nav aria-label={t("program")} className="flex flex-wrap gap-2">
            {programs.map((p) => (
              <Link
                key={p.id}
                href={`/adm/enrollment?program=${p.id}`}
                aria-current={p.id === programId ? "page" : undefined}
                className={`rounded-card border-border border px-3 py-1.5 text-sm ${
                  p.id === programId ? "bg-muted font-semibold" : ""
                }`}
              >
                {p.code} · {p.name} ({p.waiting})
              </Link>
            ))}
          </nav>
          <BulkEnroll key={programId} rows={rows} options={options} />
        </div>
      )}
    </>
  );
}
