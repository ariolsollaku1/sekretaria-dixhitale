import { FileText } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TestDocumentButtons } from "@/components/documents/document-actions";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { registerDocumentPurposes } from "@/lib/documents/purposes";
import { listTemplates } from "@/lib/documents/queries";
import { typeLabelKey } from "@/lib/documents/types";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";

const TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};

export default async function AdminDocumentsPage() {
  const user = await requireUser("/admin/documents");
  if (!(await can(user, "plt.document.manage"))) return <ForbiddenView />;
  registerDocumentPurposes();
  const [t, tAll, locale, rows] = await Promise.all([
    getTranslations("documents.admin"),
    getTranslations(),
    getLocale(),
    listTemplates(),
  ]);
  const label = (type: string) => (tAll as unknown as (k: string) => string)(typeLabelKey(type));
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Link
              href="/admin/documents/issued"
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("issuedList")}
            </Link>
            <Link href="/admin/documents/new" className={buttonVariants()}>
              {t("new")}
            </Link>
          </>
        }
      />
      <section aria-labelledby="templates-title" className="mb-8">
        <h2 id="templates-title" className="mb-3 text-xl font-semibold">
          {t("templates")}
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title={t("empty")} description={t("emptyHint")} />
        ) : (
          <div className="rounded-card border-border bg-card overflow-x-auto border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-border border-b text-left">
                  {["type", "language", "version", "validity", "status"].map((c) => (
                    <th key={c} scope="col" className="p-3 font-semibold">
                      {t(`columns.${c}` as never)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-border border-b last:border-0">
                    <th scope="row" className="p-3 text-left font-semibold">
                      <Link href={`/admin/documents/${r.id}`} className="underline">
                        {label(r.type)}
                      </Link>
                    </th>
                    <td className="p-3 uppercase">{r.language}</td>
                    <td className="font-tabular p-3">{r.version}</td>
                    <td className="font-tabular p-3">
                      {formatPlainDate(r.validFrom, locale as Locale)}
                      {r.validTo ? ` – ${formatPlainDate(r.validTo, locale as Locale)}` : " →"}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone={TONE[r.status]!} label={t(`status.${r.status}`)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="test-title">
        <h2 id="test-title" className="mb-1 text-xl font-semibold">
          {t("test")}
        </h2>
        <p className="text-muted-foreground mb-3 text-sm">{t("testHint")}</p>
        <TestDocumentButtons />
      </section>
    </>
  );
}
