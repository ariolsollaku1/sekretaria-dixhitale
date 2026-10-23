import { LayoutDashboard } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/authz/guard";
import { visibleWidgets } from "@/lib/dashboard/widgets";

// AC-10: welcome message and a widgets area modules register cards into.
export default async function DashboardPage() {
  const user = await requireUser("/");
  const t = await getTranslations("dashboard");
  const widgets = visibleWidgets(new Set(await permissionsFor(user)));
  return (
    <>
      <PageHeader title={t("welcome", { name: user.name })} />
      <p className="text-muted-foreground -mt-4 mb-6" data-testid="current-user">
        {user.name}
      </p>
      {widgets.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title={t("widgetsEmpty")}
          description={t("widgetsEmptyHint")}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {widgets.map(async (w) => (
            <section key={w.id} className="rounded-card border-border bg-card border p-4">
              {await w.component()}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
