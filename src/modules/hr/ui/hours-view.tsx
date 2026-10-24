import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatPlainDate } from "@/lib/i18n/format";
import { formatTime } from "@/modules/att";
import type { ApprovalState } from "../domain/hours-rules";
import type { MonthDetail } from "../server/hours.queries";

const TONE: Record<ApprovalState, StatusTone> = {
  PENDING: "neutral",
  APPROVED: "success",
  CHANGED: "warning",
  OPEN: "info",
};

const card = "rounded-card border-border bg-card border p-4";

export async function StateBadge({ state }: { state: ApprovalState }) {
  const t = await getTranslations("hr.hours.state");
  return <StatusBadge tone={TONE[state]} label={t(state)} />;
}

/** AC-2/AC-5: the figures, course lines, sessions and adjustments of one lecturer-month. */
export async function HoursMonthView({
  detail,
}: {
  detail: Omit<MonthDetail, "can" | "approvedAt">;
}) {
  const [t, tk, ts, locale] = await Promise.all([
    getTranslations("hr.hours"),
    getTranslations("att.kind"),
    getTranslations("att.status"),
    getLocale(),
  ]);
  const loc = locale as "sq" | "en";
  const courseOf = (assignmentId: string) => {
    const l = detail.lines.find((x) => x.assignmentId === assignmentId);
    return l ? `${l.courseCode} · ${tk(l.kind)}` : assignmentId;
  };
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="h-summary" className={card}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="h-summary" className="text-lg font-semibold">
            {detail.month}
          </h2>
          <StateBadge state={detail.state} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5" data-testid="hours-totals">
          {(
            [
              ["sessions", detail.totals.sessions],
              ["heldHours", detail.totals.heldHours],
              ["adjustments", detail.totals.adjustmentHours],
              ["total", detail.totals.total],
              ["pending", detail.totals.pending],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{t(`columns.${k}`)}</dt>
              <dd className="font-tabular text-xl font-semibold" data-testid={`total-${k}`}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
        {detail.totals.pending > 0 && (
          <p className="text-warning mt-3 text-sm">
            {t("pendingHint", { n: detail.totals.pending })}
          </p>
        )}
        {detail.state === "CHANGED" && (
          <p className="text-warning mt-3 text-sm">{t("changedHint")}</p>
        )}
      </section>

      <section aria-labelledby="h-courses" className={card}>
        <h2 id="h-courses" className="mb-3 text-lg font-semibold">
          {t("byCourse")}
        </h2>
        {detail.lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noHours")}</p>
        ) : (
          <div className="overflow-x-auto" role="region" aria-label={t("byCourse")} tabIndex={0}>
            <table className="w-full min-w-[34rem] text-sm" data-testid="hours-courses">
              <thead>
                <tr className="border-border border-b text-left">
                  {(
                    [
                      "course",
                      "kind",
                      "group",
                      "sessions",
                      "heldHours",
                      "adjustments",
                      "total",
                    ] as const
                  ).map((k) => (
                    <th key={k} scope="col" className="py-2 pr-3 font-semibold">
                      {t(`columns.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.assignmentId} className="border-border border-b last:border-0">
                    <td className="py-2 pr-3">{`${l.courseCode} ${l.courseName}`}</td>
                    <td className="py-2 pr-3">{tk(l.kind)}</td>
                    <td className="py-2 pr-3">{l.groupLabel}</td>
                    <td className="font-tabular py-2 pr-3">{l.sessions}</td>
                    <td className="font-tabular py-2 pr-3">{l.heldHours}</td>
                    <td className="font-tabular py-2 pr-3">{l.adjustmentHours}</td>
                    <td className="font-tabular py-2 pr-3 font-semibold">{l.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="h-sessions" className={card}>
        <h2 id="h-sessions" className="mb-3 text-lg font-semibold">
          {t("attendanceList")}
        </h2>
        {detail.sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noSessions")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="hours-sessions">
            {detail.sessions.map((s) => (
              <li
                key={s.id}
                className="border-border flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 text-sm last:border-0"
              >
                <span>
                  <span className="font-tabular font-semibold">
                    {formatPlainDate(s.date, loc)} {formatTime(s.startMinute)}–
                    {formatTime(s.endMinute)}
                  </span>{" "}
                  · {s.courseCode} · {tk(s.kind)}
                  {s.topic ? ` · ${s.topic}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {ts(s.status)} · {t("hoursN", { n: s.hours })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-adjust" className={card}>
        <h2 id="h-adjust" className="mb-3 text-lg font-semibold">
          {t("adjustments")}
        </h2>
        {detail.adjustments.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noAdjustments")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="hours-adjustments">
            {detail.adjustments.map((a) => (
              <li key={a.id} className="border-border border-b pb-2 text-sm last:border-0">
                <span className="font-tabular font-semibold">
                  {a.hours > 0 ? `+${a.hours}` : a.hours}
                </span>{" "}
                · {courseOf(a.assignmentId)} · {a.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The months of the signed-in lecturer, newest first (AC-2). */
export async function MonthList({
  months,
  selected,
  base,
}: {
  months: {
    month: string;
    total: number;
    sessions: number;
    pending: number;
    state: ApprovalState;
  }[];
  selected: string | undefined;
  base: string;
}) {
  const t = await getTranslations("hr.hours");
  if (months.length === 0) return <p className="text-muted-foreground text-sm">{t("noHours")}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="hours-months">
      {months.map((m) => (
        <li key={m.month}>
          <Link
            href={`${base}?month=${m.month}`}
            aria-current={m.month === selected ? "true" : undefined}
            className={`rounded-card border-border bg-card block border p-3 ${m.month === selected ? "ring-primary ring-2" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{m.month}</span>
              <StateBadge state={m.state} />
            </div>
            <div className="text-muted-foreground mt-2 text-sm">
              {t("monthSummary", { total: m.total, sessions: m.sessions })}
              {m.pending > 0 ? ` · ${t("pendingShort", { n: m.pending })}` : ""}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
