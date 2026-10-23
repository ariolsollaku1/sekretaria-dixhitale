import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { getDeliveryLog, getMessageDetail } from "@/modules/ntf";

// NTF-03 AC-8: the message and its delivery log. Someone else's message is a 404.
export default async function MessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  if (!(await can(user, "ntf.message.send"))) return <ForbiddenView />;
  const [t, locale, query] = await Promise.all([getTranslations("msg"), getLocale(), searchParams]);
  const message = await getMessageDetail(user, id);
  if (!message) notFound();
  const log = await getDeliveryLog(id, Math.max(1, Number(query.page) || 1));
  const page = Math.min(Math.max(1, Number(query.page) || 1), log.pageCount);
  const sourceKey = `source.${message.sourceTable.replace(".", "_")}`;

  return (
    <>
      <PageHeader
        title={message.subject}
        breadcrumbs={[{ label: t("title"), href: "/messages" }, { label: message.subject }]}
      />
      <p className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge
          tone={message.status === "SENT" ? "success" : "warning"}
          label={t(`status.${message.status}`)}
        />
        <time className="font-tabular" dateTime={message.createdAt.toISOString()}>
          {formatDateTime(message.createdAt, locale as Locale)}
        </time>
        <span className="text-muted-foreground">
          {t("detail.from", { name: message.createdByName })}
        </span>
        <span className="text-muted-foreground">
          {t.has(sourceKey as never) ? t(sourceKey as never) : message.sourceTable}
        </span>
      </p>
      <p className="mb-6 max-w-2xl text-sm whitespace-pre-wrap">{message.body}</p>

      <h2 className="mb-2 text-lg font-semibold">{t("detail.log")}</h2>
      <p className="text-muted-foreground mb-3 text-sm">
        {t("detail.summary", {
          total: message.recipientCount,
          delivered: message.counts.delivered,
          queued: message.counts.queued,
          noAccount: message.counts.noAccount,
        })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full max-w-3xl text-left text-sm">
          <caption className="sr-only">{t("detail.log")}</caption>
          <thead>
            <tr className="border-border border-b">
              <th scope="col" className="py-2 pr-4">
                {t("detail.person")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("detail.state")}
              </th>
              <th scope="col" className="py-2">
                {t("detail.email")}
              </th>
            </tr>
          </thead>
          <tbody>
            {log.rows.map((r) => (
              <tr key={r.id} className="border-border border-b">
                <td className="py-2 pr-4">{r.name}</td>
                <td className="py-2 pr-4">{t(`delivery.${r.state}`)}</td>
                <td className="py-2">{t(`emailState.${r.email}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {log.pageCount > 1 && (
        <nav aria-label={t("detail.pages")} className="mt-4 flex items-center gap-4 text-sm">
          {page > 1 && (
            <Link href={`/messages/${id}?page=${page - 1}`} className="underline">
              {t("detail.previous")}
            </Link>
          )}
          <span>{t("detail.page", { page, pageCount: log.pageCount })}</span>
          {page < log.pageCount && (
            <Link href={`/messages/${id}?page=${page + 1}`} className="underline">
              {t("detail.next")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
