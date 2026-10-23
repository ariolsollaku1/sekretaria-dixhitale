import { getLocale, getTranslations } from "next-intl/server";
import { DefinitionEditor } from "@/components/forms/definition-editor";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";

export default async function NewFormPage() {
  const user = await requireUser("/admin/forms/new");
  if (!(await can(user, "plt.form.manage"))) return <ForbiddenView />;
  const [t, locale] = await Promise.all([getTranslations("forms.admin"), getLocale()]);
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/admin/forms" }, { label: t("new") }]}
      />
      <DefinitionEditor mode="create" locale={locale} />
    </>
  );
}
