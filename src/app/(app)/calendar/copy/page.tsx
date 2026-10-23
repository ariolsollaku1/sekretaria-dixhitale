import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { CopyCalendarForm } from "@/modules/cal";
import { getYear, listYearOptions } from "@/modules/org";

export default async function CopyCalendarPage() {
  const user = await requireUser("/calendar/copy");
  if (!(await can(user, "cal.event.write"))) return <ForbiddenView />;
  const [t, yearId, options] = await Promise.all([
    getTranslations("cal"),
    getSelectedAcademicYear(),
    listYearOptions(),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  return (
    <>
      <PageHeader
        title={t("copy.title")}
        breadcrumbs={[{ label: t("title"), href: "/calendar" }, { label: t("copy.title") }]}
      />
      {!year || year.status === "CLOSED" ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("copy.closed")}
        </p>
      ) : (
        <CopyCalendarForm
          toYearId={year.id}
          toLabel={year.code}
          sources={options.filter((o) => o.id !== year.id)}
        />
      )}
    </>
  );
}
