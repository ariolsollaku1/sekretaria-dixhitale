import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { TimetableImport } from "@/modules/cal";

export default async function ImportTimetablePage() {
  const user = await requireUser("/cal/timetable/import");
  if (!(await can(user, "cal.timetable.write"))) return <ForbiddenView />;
  const t = await getTranslations("cal.timetable");
  return (
    <>
      <PageHeader
        title={t("import.title")}
        breadcrumbs={[{ label: t("title"), href: "/cal/timetable" }, { label: t("import.title") }]}
      />
      <TimetableImport />
    </>
  );
}
