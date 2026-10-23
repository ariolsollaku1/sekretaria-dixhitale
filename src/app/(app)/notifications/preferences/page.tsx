import { getTranslations } from "next-intl/server";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { preferencesFor } from "@/lib/notify/queries";

export default async function NotificationPreferencesPage() {
  const user = await requireUser("/notifications/preferences");
  const [t, tl, rows, canTest] = await Promise.all([
    getTranslations("notifications"),
    getTranslations("notifications"),
    preferencesFor(user.id),
    can(user, "plt.settings.write"),
  ]);
  return (
    <>
      <PageHeader
        title={t("prefs.title")}
        breadcrumbs={[{ label: t("title"), href: "/notifications" }, { label: t("prefs.title") }]}
      />
      <PreferencesForm
        rows={rows.map((r) => ({
          ...r,
          label: tl(`${r.type}.title` as never),
        }))}
        canTest={canTest}
      />
    </>
  );
}
