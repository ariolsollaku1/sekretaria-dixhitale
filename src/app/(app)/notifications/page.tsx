import { BellOff } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MarkAllReadButton } from "@/components/notifications/mark-buttons";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { listNotifications } from "@/lib/notify/queries";
import { OpenNotificationLink } from "@/components/notifications/mark-buttons";

// PLT-11 AC-9: only the signed-in user's own notifications.
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser("/notifications");
  const [t, locale, params] = await Promise.all([
    getTranslations("notifications"),
    getLocale(),
    searchParams,
  ]);
  const result = await listNotifications(user.id, Number(params.page) || 1);
  const unread = result.rows.some((r) => !r.read);

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            {unread && <MarkAllReadButton />}
            <Link
              href="/notifications/preferences"
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("preferences")}
            </Link>
          </>
        }
      />
      {result.rows.length === 0 ? (
        <EmptyState icon={BellOff} title={t("empty")} />
      ) : (
        <ol className="flex flex-col gap-2">
          {result.rows.map((n) => (
            <li key={n.id} className="rounded-card border-border bg-card border p-4">
              <div className="flex flex-wrap items-center gap-2">
                {!n.read && (
                  <span className="rounded-chip bg-info-bg text-info px-1.5 text-[13px] font-semibold">
                    {t("unread")}
                  </span>
                )}
                <h2 className="font-semibold">{n.title}</h2>
                <time
                  dateTime={n.createdAt.toISOString()}
                  className="font-tabular text-muted-foreground ml-auto text-[13px]"
                >
                  {formatDateTime(n.createdAt, locale as Locale)}
                </time>
              </div>
              <p className="mt-1 text-sm">{n.body}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {n.link && <OpenNotificationLink id={n.id} link={n.link} read={n.read} />}
              </div>
            </li>
          ))}
        </ol>
      )}
      {result.pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label={t("title")}>
          {result.page > 1 ? (
            <Link
              href={`/notifications?page=${result.page - 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm">
            {t("page", { page: result.page, pageCount: result.pageCount })}
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={`/notifications?page=${result.page + 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
