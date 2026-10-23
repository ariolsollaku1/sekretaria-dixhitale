import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { TemplateEditor } from "@/components/documents/template-editor";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { registerDocumentPurposes } from "@/lib/documents/purposes";
import { getTemplate } from "@/lib/documents/queries";
import { typeLabelKey } from "@/lib/documents/types";

const TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};

export default async function DocumentTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/admin/documents/${id}`);
  if (!(await can(user, "plt.document.manage"))) return <ForbiddenView />;
  registerDocumentPurposes();
  const row = await getTemplate(id);
  if (!row) notFound();
  const [t, tAll] = await Promise.all([getTranslations("documents.admin"), getTranslations()]);
  const title = `${(tAll as unknown as (k: string) => string)(typeLabelKey(row.type))} · ${row.language.toUpperCase()} · v${row.version}`;
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("title"), href: "/admin/documents" }, { label: title }]}
      />
      <p className="mb-6">
        <StatusBadge tone={TONE[row.status]!} label={t(`status.${row.status}`)} />
      </p>
      <TemplateEditor
        mode="edit"
        templateId={row.id}
        status={row.status}
        initial={{
          language: row.language,
          validFrom: row.validFrom.toISOString().slice(0, 10),
          validTo: row.validTo?.toISOString().slice(0, 10) ?? "",
          html: row.html,
          notes: row.notes ?? "",
        }}
      />
      <div className="mt-10">
        <EntityHistory
          entityType="DocumentTemplate"
          entityId={row.id}
          permission="plt.document.manage"
        />
      </div>
    </>
  );
}
