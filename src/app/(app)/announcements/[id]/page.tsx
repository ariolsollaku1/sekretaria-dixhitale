import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { EntityHistory } from "@/components/audit/entity-history";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import {
  AnnouncementStatusActions,
  listAttachments,
  mayManage,
  visibleAnnouncement,
} from "@/modules/ntf";

const TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};
const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// AC-6: a notice the user may not see is a 404.
export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/announcements/${id}`);
  const a = await visibleAnnouncement(user.id, id);
  if (!a) notFound();
  const [t, locale, manage, files] = await Promise.all([
    getTranslations("ntf"),
    getLocale(),
    mayManage(user, a),
    listAttachments(id),
  ]);
  const l = locale as Locale;

  return (
    <>
      <PageHeader
        title={a.title}
        breadcrumbs={[{ label: t("title"), href: "/announcements" }, { label: a.title }]}
        actions={
          manage && (
            <>
              <Link
                href={`/announcements/${a.id}/edit`}
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("edit")}
              </Link>
              <AnnouncementStatusActions announcementId={a.id} status={a.status} />
            </>
          )
        }
      />
      <p className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        {manage && <StatusBadge tone={TONE[a.status]!} label={t(`status.${a.status}`)} />}
        {a.pinned && <StatusBadge tone="info" label={t("pinned")} />}
        {a.publishAt && (
          <time className="font-tabular" dateTime={a.publishAt.toISOString()}>
            {formatDate(a.publishAt, l)}
          </time>
        )}
        {manage && (
          <span className="text-muted-foreground">
            {t(`audience.${a.audience}`)}
            {a.cycle && ` — ${t(`cycle.${a.cycle}`)}`}
            {a.programName && ` — ${a.programName}`}
          </span>
        )}
      </p>
      <div className="rounded-card border-border bg-card mb-6 max-w-3xl border p-4 text-sm whitespace-pre-line">
        {a.body}
      </div>
      {files.length > 0 && (
        <section aria-labelledby="files-title" className="mb-8">
          <h2 id="files-title" className="mb-2 text-lg font-semibold">
            {t("attachments")}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((f) => (
              <li key={f.id}>
                <a href={`/api/files/${f.id}`} className="underline">
                  {f.fileName}
                </a>{" "}
                <span className="text-muted-foreground font-tabular">({formatSize(f.size)})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {manage && (
        <EntityHistory
          entityType="Announcement"
          entityId={a.id}
          permission="ntf.announcement.write"
        />
      )}
    </>
  );
}
