import { FileText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { CancelDocumentButton } from "@/components/documents/document-actions";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { registerDocumentPurposes } from "@/lib/documents/purposes";
import { listIssued } from "@/lib/documents/queries";
import { typeLabelKey } from "@/lib/documents/types";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";

export default async function IssuedDocumentsPage() {
  const user = await requireUser("/admin/documents/issued");
  if (!(await can(user, "plt.document.manage"))) return <ForbiddenView />;
  registerDocumentPurposes();
  const [t, tAll, locale, rows] = await Promise.all([
    getTranslations("documents.admin"),
    getTranslations(),
    getLocale(),
    listIssued(),
  ]);
  const label = (type: string) => (tAll as unknown as (k: string) => string)(typeLabelKey(type));
  return (
    <>
      <PageHeader
        title={t("issuedList")}
        breadcrumbs={[{ label: t("title"), href: "/admin/documents" }, { label: t("issuedList") }]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title={t("issuedEmpty")} description={t("issuedEmptyHint")} />
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                {["number", "type", "issuedAt", "status", "actions"].map((c) => (
                  <th key={c} scope="col" className="p-3 font-semibold">
                    {t(`columns.${c}` as never)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <th scope="row" className="font-tabular p-3 text-left font-semibold">
                    <a
                      href={`/api/files/${r.fileId}`}
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.number}
                    </a>
                  </th>
                  <td className="p-3">{label(r.type)}</td>
                  <td className="font-tabular p-3">
                    {formatDateTime(r.issuedAt, locale as Locale)}
                  </td>
                  <td className="p-3">
                    <StatusBadge
                      tone={r.cancelledAt ? "danger" : "success"}
                      label={t(r.cancelledAt ? "status.cancelled" : "status.valid")}
                    />
                  </td>
                  <td className="p-3">
                    {!r.cancelledAt && <CancelDocumentButton documentId={r.id} number={r.number} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
