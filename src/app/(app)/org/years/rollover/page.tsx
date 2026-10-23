import { ListChecks } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { permissionsFor } from "@/lib/authz/guard";
import { allChecklistItems, visibleChecklist } from "@/modules/org";

// AC-11: the steps modules registered for starting a new year, filtered by the user's permissions.
export default async function RolloverPage() {
  const user = await requireUser("/org/years/rollover");
  if (!(await can(user, "org.year.read"))) return <ForbiddenView />;
  const [t, tAll, permissions] = await Promise.all([
    getTranslations("org"),
    getTranslations(),
    permissionsFor(user),
  ]);
  const items = visibleChecklist(allChecklistItems(), new Set(permissions));
  return (
    <>
      <PageHeader
        title={t("rollover.title")}
        breadcrumbs={[{ label: t("title"), href: "/org/years" }, { label: t("rollover.title") }]}
      />
      <p className="text-muted-foreground mb-6 text-sm">{t("rollover.intro")}</p>
      {items.length === 0 ? (
        <EmptyState icon={ListChecks} title={t("rollover.empty")} />
      ) : (
        <ol className="flex max-w-2xl flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-card border-border bg-card flex items-center justify-between gap-3 border p-4"
            >
              <div>
                <p className="font-semibold">{tAll(item.labelKey as never)}</p>
                {item.descriptionKey && (
                  <p className="text-muted-foreground text-sm">
                    {tAll(item.descriptionKey as never)}
                  </p>
                )}
              </div>
              <Link href={item.href} className={buttonVariants({ variant: "secondary" })}>
                {t("rollover.open")}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
