import { Cog } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import {
  JOB_STATES,
  queueOverview,
  recentJobs,
  type JobRow,
  type QueueRow,
} from "@/lib/jobs/dashboard";
import { listJobs } from "@/lib/jobs/registry";
import { RetryJobButton } from "@/lib/jobs/retry-button";
import "@/lib/jobs/all";

const TONE: Record<string, StatusTone> = {
  completed: "success",
  failed: "danger",
  active: "info",
  created: "neutral",
  retry: "warning",
  cancelled: "neutral",
};

// PLT-12 AC-7/AC-8: sysadmin view of the job system.
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; queue?: string }>;
}) {
  const user = await requireUser("/admin/jobs");
  if (!(await can(user, "plt.jobs.read"))) return <ForbiddenView />;
  const [t, locale, params, mayManage] = await Promise.all([
    getTranslations("jobs"),
    getLocale(),
    searchParams,
    can(user, "plt.jobs.manage"),
  ]);
  const l = locale as Locale;

  let queues: QueueRow[] = [];
  let jobs: JobRow[] = [];
  let failed = false;
  try {
    [queues, jobs] = await Promise.all([
      queueOverview(),
      recentJobs({ state: params.state, queue: params.queue }),
    ]);
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader title={t("title")} />
      {failed ? (
        <ErrorState title={t("unavailable")} description={t("unavailableHint")} />
      ) : (
        <>
          <section aria-labelledby="queues-title" className="mb-8">
            <h2 id="queues-title" className="mb-3 text-2xl font-semibold">
              {t("queues")}
            </h2>
            <div className="rounded-card border-border bg-card overflow-x-auto border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="p-3 font-semibold">
                      {t("columns.queue")}
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      {t("columns.schedule")}
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      {t("columns.waiting")}
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      {t("columns.active")}
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      {t("columns.failed")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queues.map((q) => (
                    <tr key={q.name} className="border-border border-b last:border-0">
                      <th scope="row" className="font-tabular p-3 text-left font-semibold">
                        {q.name}
                      </th>
                      <td className="font-tabular p-3">{q.cron ?? "—"}</td>
                      <td className="font-tabular p-3">{q.waiting}</td>
                      <td className="font-tabular p-3">{q.active}</td>
                      <td className="font-tabular p-3">
                        {q.failed > 0 ? <StatusBadge tone="danger" label={String(q.failed)} /> : 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="recent-title">
            <h2 id="recent-title" className="mb-3 text-2xl font-semibold">
              {t("recent")}
            </h2>
            <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-queue">{t("columns.queue")}</Label>
                <Select id="f-queue" name="queue" defaultValue={params.queue ?? ""}>
                  <option value="">{t("all")}</option>
                  {listJobs().map((j) => (
                    <option key={j.name} value={j.name}>
                      {j.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-state">{t("columns.state")}</Label>
                <Select id="f-state" name="state" defaultValue={params.state ?? ""}>
                  <option value="">{t("all")}</option>
                  {JOB_STATES.map((s) => (
                    <option key={s} value={s}>
                      {t(`states.${s}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit">{t("filter")}</Button>
            </form>
            {jobs.length === 0 ? (
              <EmptyState icon={Cog} title={t("empty")} />
            ) : (
              <div className="rounded-card border-border bg-card overflow-x-auto border">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead>
                    <tr className="border-border border-b text-left">
                      <th scope="col" className="p-3 font-semibold">
                        {t("columns.queue")}
                      </th>
                      <th scope="col" className="p-3 font-semibold">
                        {t("columns.state")}
                      </th>
                      <th scope="col" className="p-3 font-semibold">
                        {t("columns.attempts")}
                      </th>
                      <th scope="col" className="p-3 font-semibold">
                        {t("columns.created")}
                      </th>
                      <th scope="col" className="p-3 font-semibold">
                        {t("columns.started")}
                      </th>
                      <th scope="col" className="p-3 font-semibold">
                        {t("columns.finished")}
                      </th>
                      <th scope="col" className="p-3">
                        <span className="sr-only">{t("retry")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} className="border-border border-b last:border-0">
                        <th scope="row" className="font-tabular p-3 text-left font-normal">
                          {j.name}
                        </th>
                        <td className="p-3">
                          <StatusBadge
                            tone={TONE[j.state] ?? "neutral"}
                            label={t(`states.${j.state}`)}
                          />
                        </td>
                        <td className="font-tabular p-3">{j.attempts}</td>
                        <td className="font-tabular p-3 whitespace-nowrap">
                          {formatDateTime(j.createdOn, l)}
                        </td>
                        <td className="font-tabular p-3 whitespace-nowrap">
                          {j.startedOn ? formatDateTime(j.startedOn, l) : "—"}
                        </td>
                        <td className="font-tabular p-3 whitespace-nowrap">
                          {j.completedOn ? formatDateTime(j.completedOn, l) : "—"}
                        </td>
                        <td className="p-3">
                          {mayManage && j.state === "failed" && (
                            <RetryJobButton queue={j.name} id={j.id} />
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
