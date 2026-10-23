import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { ScrollText } from "lucide-react";
import { listAudit, type AuditFilters } from "@/lib/audit/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

const FILTER_KEYS = ["actor", "action", "entityType", "entityId", "from", "to"] as const;

type Search = Partial<Record<(typeof FILTER_KEYS)[number] | "page", string>>;

// AC-6: sysadmin-only list, newest first, server-side pagination, filters in the URL.
export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser("/admin/audit");
  if (!(await can(user, "plt.audit.read"))) return <ForbiddenView />;

  const params = await searchParams;
  const filters: AuditFilters = Object.fromEntries(
    FILTER_KEYS.flatMap((k) => (params[k] ? [[k, params[k]]] : [])),
  );
  const [t, tActors, locale, result] = await Promise.all([
    getTranslations("audit"),
    getTranslations("audit.actors"),
    getLocale(),
    listAudit(filters, Number(params.page) || 1),
  ]);

  const pageLink = (page: number) => {
    const q = new URLSearchParams(Object.entries(filters) as [string, string][]);
    q.set("page", String(page));
    return `/admin/audit?${q}`;
  };

  const fields: { key: (typeof FILTER_KEYS)[number]; type?: string }[] = [
    { key: "actor" },
    { key: "action" },
    { key: "entityType" },
    { key: "entityId" },
    { key: "from", type: "date" },
    { key: "to", type: "date" },
  ];

  return (
    <>
      <PageHeader title={t("title")} />
      <form
        method="get"
        className="rounded-card border-border bg-card mb-6 grid gap-3 border p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {fields.map(({ key, type }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`f-${key}`}>{t(`filters.${key}`)}</Label>
            <Input
              id={`f-${key}`}
              name={key}
              type={type ?? "text"}
              defaultValue={params[key] ?? ""}
            />
          </div>
        ))}
        <div className="flex items-end gap-2">
          <Button type="submit">{t("filters.apply")}</Button>
          <Link href="/admin/audit" className={buttonVariants({ variant: "secondary" })}>
            {t("filters.reset")}
          </Link>
        </div>
      </form>

      <p className="text-muted-foreground mb-2 text-sm" aria-live="polite">
        {t("count", { count: result.total })}
      </p>

      {result.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("empty")} />
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.time")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.actor")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.action")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.entity")}
                </th>
                <th scope="col" className="p-3">
                  <span className="sr-only">{t("columns.open")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <td className="font-tabular p-3 whitespace-nowrap">
                    {formatDateTime(r.at, locale as Locale)}
                  </td>
                  <td className="p-3">
                    {r.actor.label ??
                      (r.actor.type === "SYSTEM" ? tActors("system") : tActors("public"))}
                  </td>
                  <td className="font-tabular p-3">{r.action}</td>
                  <td className="font-tabular p-3 break-all">
                    {r.entityType}
                    {r.entityId ? ` · ${r.entityId}` : ""}
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/audit/${r.id}`} className="underline">
                      {t("columns.open")}
                      <span className="sr-only"> {r.action}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.pageCount > 1 && (
        <nav
          className="mt-4 flex items-center justify-between"
          aria-label={t("page", { page: result.page, pageCount: result.pageCount })}
        >
          {result.page > 1 ? (
            <Link
              href={pageLink(result.page - 1)}
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
              href={pageLink(result.page + 1)}
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
