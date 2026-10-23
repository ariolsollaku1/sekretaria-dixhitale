import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { EventForm, listProgramOptions } from "@/modules/cal";
import { getYear } from "@/modules/org";

export default async function NewEventPage() {
  const user = await requireUser("/calendar/events/new");
  if (!(await can(user, "cal.event.write"))) return <ForbiddenView />;
  const [t, yearId, programs] = await Promise.all([
    getTranslations("cal"),
    getSelectedAcademicYear(),
    listProgramOptions(),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/calendar" }, { label: t("new") }]}
      />
      {!year || year.status === "CLOSED" ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("errors.YEAR_CLOSED")}
        </p>
      ) : (
        <>
          <p className="text-muted-foreground mb-4 text-sm">
            {t("form.forYear", { year: year.code })}
          </p>
          <EventForm mode="create" yearId={year.id} programs={programs} />
        </>
      )}
    </>
  );
}
