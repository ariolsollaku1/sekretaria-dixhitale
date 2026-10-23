import { Megaphone, Pin } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { feed } from "@/modules/ntf";

// AC-5: the notices visible to the signed-in user, pinned first then newest first.
export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser("/announcements");
  const [t, locale, mayWrite, params] = await Promise.all([
    getTranslations("ntf"),
    getLocale(),
    can(user, "ntf.announcement.write"),
    searchParams,
  ]);
  const l = locale as Locale;
  const result = await feed(user.id, Number(params.page) || 1);
  const page = Math.min(Math.max(1, Number(params.page) || 1), result.pageCount);

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <>
              <Link
                href="/announcements/manage"
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("manage")}
              </Link>
              <Link href="/announcements/new" className={buttonVariants()}>
                {t("new")}
              </Link>
            </>
          )
        }
      />
      {result.rows.length === 0 ? (
        <EmptyState icon={Megaphone} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <ol className="flex flex-col gap-3">
          {result.rows.map((a) => (
            <li key={a.id} className="rounded-card border-border bg-card border p-4">
              <div className="flex flex-wrap items-center gap-2">
                {a.pinned && <StatusBadge tone="info" label={t("pinned")} />}
                <h2 className="text-lg font-semibold">
                  <Link href={`/announcements/${a.id}`} className="underline">
                    {a.title}
                  </Link>
                </h2>
                {a.pinned && <Pin aria-hidden className="text-muted-foreground size-4" />}
                {a.publishAt && (
                  <time
                    dateTime={a.publishAt.toISOString()}
                    className="font-tabular text-muted-foreground ml-auto text-[13px]"
                  >
                    {formatDate(a.publishAt, l)}
                  </time>
                )}
              </div>
              <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line">{a.body}</p>
            </li>
          ))}
        </ol>
      )}
      {result.pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label={t("title")}>
          {page > 1 ? (
            <Link
              href={`/announcements?page=${page - 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm">{t("page", { page, pageCount: result.pageCount })}</span>
          {page < result.pageCount ? (
            <Link
              href={`/announcements?page=${page + 1}`}
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
