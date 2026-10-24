import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { LogIn, ShieldCheck, UserRound } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
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
      <RecordHero
        name={detail.name}
        subtitle={detail.email}
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
        badges={
          <StatusBadge
            tone={detail.active ? "success" : "neutral"}
            label={t(detail.active ? "status.active" : "status.inactive")}
          />
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {mayWrite && (
            <Card aria-labelledby="account-title">
              <CardTitle id="account-title" icon={UserRound}>
                {t("detail.account")}
              </CardTitle>
              <UserEditForm
                defaults={{
                  userId: detail.id,
                  email: detail.email,
                  firstName: names.firstName,
                  lastName: names.lastName,
                }}
              />
            </Card>
          )}
          <Card aria-labelledby="roles-title">
            <CardTitle id="roles-title" icon={ShieldCheck}>
              {t("detail.roles")}
            </CardTitle>
            {mayWrite ? (
              <UserRolesPanel userId={detail.id} assignments={assignments} options={options} />
            ) : (
              <ul className="text-sm">
                {assignments.map((a) => (
                  <li key={a.id}>{a.role}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card aria-labelledby="signin-title">
          <CardTitle id="signin-title" icon={LogIn}>
            {t("detail.signIn")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              { label: t("columns.email"), value: detail.email },
              {
                label: t("columns.lastLogin"),
                value: detail.lastLoginAt
                  ? formatDateTime(detail.lastLoginAt, locale as Locale)
                  : t("neverLoggedIn"),
              },
            ]}
          />
        </Card>
      </div>
      <div className="mt-6">
        <EntityHistory entityType="User" entityId={detail.id} permission="iam.user.read" />
      </div>
    </>
  );
}
