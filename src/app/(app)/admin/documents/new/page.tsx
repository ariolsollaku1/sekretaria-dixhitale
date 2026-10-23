import { getTranslations } from "next-intl/server";
import { TemplateEditor } from "@/components/documents/template-editor";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { registerDocumentPurposes } from "@/lib/documents/purposes";
import { listDocumentTypes, typeLabelKey } from "@/lib/documents/types";

export default async function NewDocumentTemplatePage() {
  const user = await requireUser("/admin/documents/new");
  if (!(await can(user, "plt.document.manage"))) return <ForbiddenView />;
  registerDocumentPurposes();
  const [t, tAll] = await Promise.all([getTranslations("documents.admin"), getTranslations()]);
  const label = (type: string) => (tAll as unknown as (k: string) => string)(typeLabelKey(type));
  const types = listDocumentTypes().map((d) => ({ type: d.type, label: label(d.type) }));
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/admin/documents" }, { label: t("new") }]}
      />
      <TemplateEditor mode="create" type={types[0]?.type ?? ""} types={types} />
    </>
  );
}
