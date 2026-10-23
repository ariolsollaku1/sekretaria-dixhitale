import { Users } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { ROLES } from "@/lib/authz/roles";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { listUsers } from "@/modules/iam";

type Search = { q?: string; role?: string; status?: string; page?: string };

// AC-1: sysadmin-only list with search, role/status filters and server-side pagination.
export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser("/admin/users");
  if (!(await can(user, "iam.user.read"))) return <ForbiddenView />;

  const params = await searchParams;
  const filters = { q: params.q, role: params.role, status: params.status };
  const [t, tRoles, locale, result, mayWrite] = await Promise.all([
    getTranslations("iam"),
    getTranslations("roles"),
    getLocale(),
    listUsers(filters, Number(params.page) || 1),
    can(user, "iam.user.write"),
  ]);

  const pageLink = (page: number) => {
    const q = new URLSearchParams(Object.entries(filters).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    q.set("page", String(page));
    return `/admin/users?${q}`;
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          mayWrite && (
            <Link href="/admin/users/new" className={buttonVariants()}>
              {t("new")}
            </Link>
          )
        }
      />
      <form
        method="get"
        className="rounded-card border-border bg-card mb-6 grid gap-3 border p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-q">{t("search")}</Label>
          <Input id="f-q" name="q" defaultValue={params.q ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-role">{t("filters.role")}</Label>
          <Select id="f-role" name="role" defaultValue={params.role ?? ""}>
            <option value="">{t("filters.all")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-status">{t("filters.status")}</Label>
          <Select id="f-status" name="status" defaultValue={params.status ?? ""}>
            <option value="">{t("filters.all")}</option>
            <option value="active">{t("filters.active")}</option>
            <option value="inactive">{t("filters.inactive")}</option>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">{t("filters.apply")}</Button>
          <Link href="/admin/users" className={buttonVariants({ variant: "secondary" })}>
            {t("filters.reset")}
          </Link>
        </div>
      </form>

      <p className="text-muted-foreground mb-2 text-sm" aria-live="polite">
        {t("count", { count: result.total })}
      </p>

      {result.rows.length === 0 ? (
        <EmptyState icon={Users} title={t("empty")} />
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.name")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.email")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.roles")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.status")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.lastLogin")}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <th scope="row" className="p-3 text-left font-semibold">
                    <Link href={`/admin/users/${r.id}`} className="underline">
                      {r.name}
                    </Link>
                  </th>
                  <td className="p-3 break-all">{r.email}</td>
                  <td className="p-3">{r.roles.map((x) => tRoles(x)).join(", ") || "—"}</td>
                  <td className="p-3">
                    <StatusBadge
                      tone={r.active ? "success" : "neutral"}
                      label={t(r.active ? "status.active" : "status.inactive")}
                    />
                  </td>
                  <td className="font-tabular p-3 whitespace-nowrap">
                    {r.lastLoginAt
                      ? formatDateTime(r.lastLoginAt, locale as Locale)
                      : t("neverLoggedIn")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label={t("title")}>
          {result.page > 1 ? (
            <Link
              href={pageLink(result.page - 1)}
              className={buttonVariants({ variant: "secondary" })}
            >
              ‹
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm">
            {result.page} / {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={pageLink(result.page + 1)}
              className={buttonVariants({ variant: "secondary" })}
            >
              ›
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
