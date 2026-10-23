import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { ProgramForm, getProgramConfig, listDepartmentOptions, listSubtypes } from "@/modules/org";

export default async function NewProgramPage() {
  const user = await requireUser("/org/programs/new");
  if (!(await can(user, "org.program.write"))) return <ForbiddenView />;
  const [t, tu, departments, config, subtypes] = await Promise.all([
    getTranslations("org.program"),
    getTranslations("org.unit"),
    listDepartmentOptions(),
    getProgramConfig(),
    listSubtypes(),
  ]);
  return (
    <>
      <PageHeader
        title={t("create")}
        breadcrumbs={[{ label: t("title"), href: "/org/programs" }, { label: t("create") }]}
      />
      {departments.length === 0 ? (
        <EmptyState title={tu("noDepartments")} />
      ) : (
        <ProgramForm
          mode="create"
          departments={departments}
          durations={config.durations}
          subtypes={subtypes}
        />
      )}
    </>
  );
}
