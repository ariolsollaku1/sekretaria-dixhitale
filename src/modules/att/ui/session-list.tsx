import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatTime } from "../domain/session-rules";
import type { SessionView } from "../server/session.queries";

const TONE: Record<SessionView["status"], StatusTone> = {
  PLANNED: "info",
  HELD: "success",
  CANCELLED: "neutral",
};

/** AC-9: sessions as cards (readable at 360 px), newest first, each linking to its roster. */
export async function SessionList({
  sessions,
  showGroup,
  showLecturer,
}: {
  sessions: SessionView[];
  showGroup?: boolean;
  showLecturer?: boolean;
}) {
  const t = await getTranslations("att");
  if (sessions.length === 0)
    return <p className="text-muted-foreground text-sm">{t("noSessions")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((s) => (
        <li
          key={s.id}
          className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-3"
        >
          <div className="min-w-0 text-sm">
            <p className="font-tabular font-semibold">
              <time dateTime={s.date}>{s.date}</time> · {formatTime(s.startMinute)}–
              {formatTime(s.endMinute)} · {t("hoursCount", { count: s.hours })}
            </p>
            <p>
              <span className="font-semibold">{s.courseCode}</span> {s.courseName} ·{" "}
              {t(`kind.${s.kind}`)}
            </p>
            {showGroup && <p className="text-muted-foreground">{s.groupLabel}</p>}
            {showLecturer && <p className="text-muted-foreground">{s.lecturer}</p>}
            {s.topic && <p className="text-muted-foreground italic">{s.topic}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={TONE[s.status]} label={t(`status.${s.status}`)} />
            {s.status === "HELD" && (
              <span className="text-[13px]">
                {t("counts", { absent: s.counts.absent, excused: s.counts.excused })}
              </span>
            )}
            <Link
              href={`/att/sessions/${s.id}`}
              className="text-primary min-h-11 content-center text-sm font-semibold underline"
            >
              {t("open")}
              <span className="sr-only">
                {" "}
                {s.courseCode} {s.date}
              </span>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
