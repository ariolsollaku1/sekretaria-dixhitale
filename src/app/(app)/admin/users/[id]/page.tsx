import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { getScopeResolver } from "@/lib/authz/registry";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import {
  UserEditForm,
  UserRolesPanel,
  UserStatusActions,
  getRoleEditorOptions,
  getUserDetail,
  splitName,
} from "@/modules/iam";

// AC-5, AC-6, AC-8, AC-10, AC-11 on one page. Reads need iam.user.read, controls need iam.user.write.
export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser(`/admin/users/${id}`);
  if (!(await can(me, "iam.user.read"))) return <ForbiddenView />;

  const detail = await getUserDetail(id);
  if (!detail) notFound();
  const [t, locale, options, mayWrite] = await Promise.all([
    getTranslations("iam"),
    getLocale(),
    getRoleEditorOptions(),
    can(me, "iam.user.write"),
  ]);

  const assignments = await Promise.all(
    detail.roles.map(async (r) => {
      const choices = await getScopeResolver(r.scopeType)?.options?.();
      return {
        id: r.id,
        role: r.role,
        scopeType: r.scopeType,
        scopeLabel: choices?.find((c) => c.id === r.scopeId)?.label ?? r.scopeId,
      };
    }),
  );
  const names = splitName(detail.name);

  return (
    <>
      <PageHeader
        title={detail.name}
        breadcrumbs={[{ label: t("title"), href: "/admin/users" }, { label: detail.name }]}
        actions={
          mayWrite && (
            <UserStatusActions
              userId={detail.id}
              active={detail.active}
              canResend={detail.canResend}
              isSelf={me.id === detail.id}
            />
          )
        }
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge
          tone={detail.active ? "success" : "neutral"}
          label={t(detail.active ? "status.active" : "status.inactive")}
        />
        <span>{detail.email}</span>
        <span className="text-muted-foreground">
          {t("columns.lastLogin")}:{" "}
          {detail.lastLoginAt
            ? formatDateTime(detail.lastLoginAt, locale as Locale)
            : t("neverLoggedIn")}
        </span>
      </p>

      {mayWrite && (
        <section aria-labelledby="account-title" className="mb-8">
          <h2 id="account-title" className="mb-3 text-2xl font-semibold">
            {t("detail.account")}
          </h2>
          <UserEditForm
            defaults={{
              userId: detail.id,
              email: detail.email,
              firstName: names.firstName,
              lastName: names.lastName,
            }}
          />
        </section>
      )}

      <section aria-labelledby="roles-title">
        <h2 id="roles-title" className="mb-3 text-2xl font-semibold">
          {t("detail.roles")}
        </h2>
        {mayWrite ? (
          <UserRolesPanel userId={detail.id} assignments={assignments} options={options} />
        ) : (
          <ul className="text-sm">
            {assignments.map((a) => (
              <li key={a.id}>{a.role}</li>
            ))}
          </ul>
        )}
      </section>

      <EntityHistory entityType="User" entityId={detail.id} permission="iam.user.read" />
    </>
  );
}
