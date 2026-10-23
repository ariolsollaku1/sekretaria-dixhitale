import { Files } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { FileUpload } from "@/components/files/file-upload";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { MIME } from "@/lib/files/mime";
import { registerAllPurposes } from "@/lib/files/all";
import { getFilePurpose } from "@/lib/files/purposes";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";

const TYPE_LABELS: Record<string, string> = {
  [MIME.pdf]: "PDF",
  [MIME.jpeg]: "JPEG",
  [MIME.png]: "PNG",
  [MIME.docx]: "DOCX",
  [MIME.xlsx]: "XLSX",
};

// Reference page for the `general` purpose: upload, then see your own latest uploads and download them.
export default async function FilesPage() {
  const user = await requireUser("/admin/files");
  if (!(await can(user, "plt.file.read"))) return <ForbiddenView />;
  registerAllPurposes();
  const purpose = getFilePurpose("general")!;
  const [t, locale, files, mayUpload] = await Promise.all([
    getTranslations("files"),
    getLocale(),
    db.storedFile.findMany({
      where: { uploadedById: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    can(user, purpose.uploadPermission),
  ]);

  return (
    <>
      <PageHeader title={t("title")} />
      {mayUpload && (
        <div className="rounded-card border-border bg-card mb-8 max-w-xl border p-4">
          <FileUpload
            purpose="general"
            maxBytes={purpose.maxBytes}
            mimeTypes={purpose.mimeTypes}
            typeLabels={purpose.mimeTypes.map((m) => TYPE_LABELS[m] ?? m)}
          />
        </div>
      )}
      <h2 className="mb-3 text-2xl font-semibold">{t("mine")}</h2>
      {files.length === 0 ? (
        <EmptyState icon={Files} title={t("empty")} />
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.name")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.size")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.time")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.status")}
                </th>
                <th scope="col" className="p-3">
                  <span className="sr-only">{t("columns.download")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-border border-b last:border-0">
                  <th scope="row" className="p-3 text-left font-normal break-all">
                    {f.fileName}
                  </th>
                  <td className="font-tabular p-3 whitespace-nowrap">
                    {formatNumber(Math.max(1, Math.round(f.size / 1024)), locale as Locale)} KB
                  </td>
                  <td className="font-tabular p-3 whitespace-nowrap">
                    {formatDateTime(f.createdAt, locale as Locale)}
                  </td>
                  <td className="p-3">
                    <StatusBadge
                      tone={f.status === "ATTACHED" ? "success" : "neutral"}
                      label={t(`status.${f.status}`)}
                    />
                  </td>
                  <td className="p-3">
                    <a href={`/api/files/${f.id}`} className="underline">
                      {t("columns.download")}
                      <span className="sr-only"> {f.fileName}</span>
                    </a>
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
