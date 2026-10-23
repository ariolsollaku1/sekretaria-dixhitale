import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { UserForm, getRoleEditorOptions } from "@/modules/iam";

export default async function NewUserPage() {
  const user = await requireUser("/admin/users/new");
  if (!(await can(user, "iam.user.write"))) return <ForbiddenView />;
  const [t, options] = await Promise.all([getTranslations("iam"), getRoleEditorOptions()]);
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumbs={[{ label: t("title"), href: "/admin/users" }, { label: t("new") }]}
      />
      <UserForm options={options} />
    </>
  );
}
