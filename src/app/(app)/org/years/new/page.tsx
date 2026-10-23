import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { YearForm } from "@/modules/org";

export default async function NewYearPage() {
  const user = await requireUser("/org/years/new");
  if (!(await can(user, "org.year.write"))) return <ForbiddenView />;
  const t = await getTranslations("org");
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/org/years" }, { label: t("new") }]}
      />
      <YearForm mode="create" />
    </>
  );
}
