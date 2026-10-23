import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { DefinitionEditor } from "@/components/forms/definition-editor";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { getDefinitionRow } from "@/lib/forms/queries";

const TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};

export default async function FormDefinitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/admin/forms/${id}`);
  if (!(await can(user, "plt.form.manage"))) return <ForbiddenView />;
  const row = await getDefinitionRow(id);
  if (!row) notFound();
  const [t, locale] = await Promise.all([getTranslations("forms.admin"), getLocale()]);
  const title = `${row.key} · v${row.version}`;
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t("title"), href: "/admin/forms" }, { label: title }]}
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={TONE[row.status]!} label={t(`status.${row.status}`)} />
        {row.status === "PUBLISHED" && (
          <span className="font-tabular">
            {row.audience === "PUBLIC" ? `/f/${row.key}` : `/forms/${row.key}`}
          </span>
        )}
      </p>
      <DefinitionEditor
        mode="edit"
        definitionId={row.id}
        formKey={row.key}
        status={row.status}
        locale={locale}
        initial={{
          audience: row.audience,
          ownerRoles: row.ownerRoles,
          definition: JSON.stringify(row.definition, null, 2),
        }}
      />
      <div className="mt-10">
        <EntityHistory entityType="FormDefinition" entityId={row.id} permission="plt.form.manage" />
      </div>
    </>
  );
}
