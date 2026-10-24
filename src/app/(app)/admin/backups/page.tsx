import { DatabaseBackup, Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { backupOverview, type BackupOverview, type RunRow } from "@/lib/backup/queries";
import { RunButtons } from "@/lib/backup/run-buttons";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";

const TONE: Record<RunRow["status"], StatusTone> = {
  SUCCEEDED: "success",
  FAILED: "danger",
  RUNNING: "info",
};

// PLT-13 AC-8/AC-9/AC-10: sysadmin view of the exports and integrity checks.
export default async function BackupsPage() {
  const user = await requireUser("/admin/backups");
  if (!(await can(user, "plt.backup.read"))) return <ForbiddenView />;
  const [t, locale, mayManage] = await Promise.all([
    getTranslations("backups"),
    getLocale(),
    can(user, "plt.backup.manage"),
  ]);
  const l = locale as Locale;

  let overview: BackupOverview | null = null;
  try {
    overview = await backupOverview();
  } catch {
    overview = null;
  }

  const size = (bytes: number | null) =>
    bytes === null ? "—" : `${formatNumber(bytes / 1_048_576, l, { maximumFractionDigits: 1 })} MB`;
  const when = (d: Date | null) => (d ? formatDateTime(d, l) : "—");

  return (
    <>
      <PageHeader title={t("title")} actions={mayManage ? <RunButtons /> : undefined} />
      {overview === null ? (
        <ErrorState title={t("unavailable")} description={t("unavailableHint")} />
      ) : (
        <>
          {(overview.exportStale || overview.integrityStale) && (
            <div
              role="alert"
              className="border-warning bg-warning-bg text-warning rounded-card mb-6 border p-4 text-sm font-semibold"
            >
              {overview.exportStale && <p>{t("staleExport")}</p>}
              {overview.integrityStale && <p>{t("staleIntegrity")}</p>}
            </div>
          )}
          {overview.pending > 0 && (
            <p className="text-muted-foreground mb-4 text-sm" role="status">
              {t("pending", { count: overview.pending })}
            </p>
          )}

          <section aria-labelledby="latest-title" className="mb-8">
            <h2 id="latest-title" className="mb-3 text-2xl font-semibold">
              {t("latest")}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ["export", overview.latestExport],
                  ["integrity", overview.latestIntegrity],
                ] as const
              ).map(([kind, run]) => (
                <div key={kind} className="rounded-card border-border bg-card border p-4">
                  <h3 className="mb-2 font-semibold">{t(`kinds.${kind}`)}</h3>
                  {run ? (
                    <>
                      <StatusBadge tone={TONE[run.status]} label={t(`status.${run.status}`)} />
                      <p className="text-muted-foreground mt-2 text-sm">{when(run.startedAt)}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">{t("never")}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              {t("retention", { count: overview.keep })}
            </p>
          </section>

          <section aria-labelledby="runs-title">
            <h2 id="runs-title" className="mb-3 text-2xl font-semibold">
              {t("recent")}
            </h2>
            {overview.runs.length === 0 ? (
              <EmptyState icon={DatabaseBackup} title={t("empty")} />
            ) : (
              <div className="rounded-card border-border bg-card overflow-x-auto border">
                <table className="w-full min-w-[52rem] text-sm">
                  <thead>
                    <tr className="border-border border-b text-left">
                      {(
                        [
                          "kind",
                          "status",
                          "started",
                          "finished",
                          "tables",
                          "rows",
                          "files",
                          "problems",
                          "size",
                        ] as const
                      ).map((c) => (
                        <th key={c} scope="col" className="p-3 font-semibold">
                          {t(`columns.${c}`)}
                        </th>
                      ))}
                      <th scope="col" className="p-3">
                        <span className="sr-only">{t("download")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.runs.map((r) => (
                      <tr key={r.id} className="border-border border-b last:border-0">
                        <th scope="row" className="p-3 text-left font-normal">
                          {t(`kinds.${r.kind === "EXPORT" ? "export" : "integrity"}`)}
                          {r.requested ? ` · ${t("manual")}` : ""}
                        </th>
                        <td className="p-3">
                          <StatusBadge tone={TONE[r.status]} label={t(`status.${r.status}`)} />
                          {r.errorCode && (
                            <span className="font-tabular text-muted-foreground ml-2 text-xs">
                              {r.errorCode}
                            </span>
                          )}
                        </td>
                        <td className="font-tabular p-3">{when(r.startedAt)}</td>
                        <td className="font-tabular p-3">{when(r.finishedAt)}</td>
                        <td className="font-tabular p-3">
                          {r.kind === "EXPORT" ? r.tableCount : "—"}
                        </td>
                        <td className="font-tabular p-3">
                          {r.kind === "EXPORT" ? formatNumber(r.rowCount, l) : "—"}
                        </td>
                        <td className="font-tabular p-3">{r.fileCount}</td>
                        <td className="font-tabular p-3">{r.problemCount}</td>
                        <td className="font-tabular p-3">{size(r.sizeBytes)}</td>
                        <td className="p-3">
                          {r.downloadable && mayManage && (
                            <a
                              href={`/api/admin/backups/${r.id}`}
                              aria-label={`${t("download")} ${when(r.startedAt)}`}
                              className="text-primary inline-flex items-center gap-1 font-semibold underline"
                            >
                              <Download className="size-4" aria-hidden /> {t("download")}
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
