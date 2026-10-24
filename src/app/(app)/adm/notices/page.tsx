import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { listNotices } from "@/modules/adm";

const TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};

// AC-7: the registration notices, for the offices that write them.
export default async function NoticesPage() {
  const user = await requireUser("/adm/notices");
  if (!(await can(user, "adm.notice.write"))) return <ForbiddenView />;
  const [t, tn, locale, rows] = await Promise.all([
    getTranslations("adm"),
    getTranslations("ntf"),
    getLocale(),
    listNotices(),
  ]);
  const l = locale as Locale;
  return (
    <>
      <PageHeader
        title={t("list.title")}
        actions={
          <Link href="/adm/notices/new" className={buttonVariants()}>
            {t("list.new")}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("list.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("list.title")}</caption>
            <thead>
              <tr className="border-border border-b">
                {(["title", "year", "program", "deadline", "status"] as const).map((c) => (
                  <th key={c} scope="col" className="py-2 pr-4">
                    {t(`list.columns.${c}`)}
                  </th>
                ))}
                <th scope="col" className="py-2">
                  <span className="sr-only">{t("list.columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="border-border border-b align-top">
                  <td className="py-2 pr-4">
                    <Link href={`/announcements/${n.announcementId}`} className="underline">
                      {n.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{n.yearCode}</td>
                  <td className="py-2 pr-4">{n.programLabel ?? t("list.allPrograms")}</td>
                  <td className="font-tabular py-2 pr-4">
                    {formatDate(new Date(`${n.registrationDeadline}T12:00:00Z`), l)}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge tone={TONE[n.status]!} label={tn(`status.${n.status}`)} />
                  </td>
                  <td className="py-2">
                    <Link href={`/adm/notices/${n.id}/edit`} className="underline">
                      {t("list.edit")} <span className="sr-only">{n.title}</span>
                    </Link>
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
