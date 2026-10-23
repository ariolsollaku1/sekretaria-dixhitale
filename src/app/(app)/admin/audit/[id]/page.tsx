import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DiffTable } from "@/components/audit/diff-table";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { getAuditEntry } from "@/lib/audit/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

export default async function AuditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/admin/audit/${id}`);
  if (!(await can(user, "plt.audit.read"))) return <ForbiddenView />;

  const entry = await getAuditEntry(id);
  if (!entry) notFound();
  const [t, tActors, locale] = await Promise.all([
    getTranslations("audit"),
    getTranslations("audit.actors"),
    getLocale(),
  ]);

  const meta: [string, string | null][] = [
    [t("columns.time"), formatDateTime(entry.at, locale as Locale)],
    [
      t("columns.actor"),
      entry.actor.label ?? (entry.actor.type === "SYSTEM" ? tActors("system") : tActors("public")),
    ],
    [t("columns.action"), entry.action],
    [t("columns.entity"), `${entry.entityType}${entry.entityId ? ` · ${entry.entityId}` : ""}`],
    [t("detail.reason"), entry.reason],
    [t("detail.request"), entry.requestId],
    [t("detail.ip"), entry.ip],
    [t("detail.userAgent"), entry.userAgent],
  ];

  return (
    <>
      <PageHeader
        title={t("detail.title")}
        breadcrumbs={[{ label: t("title"), href: "/admin/audit" }, { label: entry.action }]}
      />
      <dl className="rounded-card border-border bg-card grid gap-x-6 gap-y-2 border p-4 text-sm sm:grid-cols-[max-content_1fr]">
        {meta.map(([label, value]) =>
          value ? (
            <div key={label} className="contents">
              <dt className="font-semibold">{label}</dt>
              <dd className="font-tabular break-all">{value}</dd>
            </div>
          ) : null,
        )}
      </dl>
      <h2 className="mt-8 mb-3 text-2xl font-semibold">{t("detail.changes")}</h2>
      <div className="rounded-card border-border bg-card border p-4">
        <DiffTable before={entry.before} after={entry.after} />
      </div>
    </>
  );
}
