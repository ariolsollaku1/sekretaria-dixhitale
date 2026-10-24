import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { AttendanceForm, formatTime, getSessionDetail, getWindowDays } from "@/modules/att";

// ATT-01 AC-4..AC-7: the roster of one class; editable by the owner lecturer in the window, by the
// Secretariat with a reason. Anyone outside the session's scope gets a plain 404.
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/att/sessions/${id}`);
  const s = await getSessionDetail(user, id);
  if (!s) notFound();
  const [t, windowDays] = await Promise.all([getTranslations("att"), getWindowDays()]);
  const tone = s.status === "HELD" ? "success" : s.status === "PLANNED" ? "info" : "neutral";
  return (
    <>
      <PageHeader
        title={`${s.courseCode} · ${t(`kind.${s.kind}`)}`}
        breadcrumbs={[
          {
            label: t("sessionsTitle"),
            href: s.access.edit === "record" ? "/att/mine" : "/att/sessions",
          },
          { label: s.date },
        ]}
        actions={<StatusBadge tone={tone} label={t(`status.${s.status}`)} />}
      />
      <p className="text-muted-foreground mb-4 text-sm">
        {s.courseName} · {s.groupLabel} · <time dateTime={s.date}>{s.date}</time>{" "}
        {formatTime(s.startMinute)}–{formatTime(s.endMinute)} · {s.lecturer}
      </p>
      {s.access.blocked && (
        <p role="status" className="rounded-control border-border bg-muted mb-4 border p-3 text-sm">
          {t(`blocked.${s.access.blocked}`, { days: windowDays })}
        </p>
      )}
      <AttendanceForm
        key={`${s.id}-${s.status}-${s.roster.map((r) => r.status).join("")}`}
        sessionId={s.id}
        status={s.status}
        hours={s.hours}
        topic={s.topic}
        roster={s.roster}
        edit={s.access.edit}
      />
    </>
  );
}
