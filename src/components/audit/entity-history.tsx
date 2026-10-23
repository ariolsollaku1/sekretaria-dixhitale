import { History } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { auditForEntity } from "@/lib/audit/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { DiffTable } from "./diff-table";

/**
 * AC-7: modules embed this in detail pages. Shows the entity's audit entries to users who hold
 * `permission`; renders nothing for everyone else (the permission is checked here, not by the UI).
 */
export async function EntityHistory({
  entityType,
  entityId,
  permission,
}: {
  entityType: string;
  entityId: string;
  permission: string;
}) {
  const user = await getCurrentUser();
  if (!user || !(await can(user, permission))) return null;
  const [t, tActors, locale, entries] = await Promise.all([
    getTranslations("audit.history"),
    getTranslations("audit.actors"),
    getLocale(),
    auditForEntity(entityType, entityId),
  ]);
  return (
    <section aria-labelledby="entity-history-title" className="mt-8">
      <h2 id="entity-history-title" className="mb-3 text-2xl font-semibold">
        {t("title")}
      </h2>
      {entries.length === 0 ? (
        <EmptyState icon={History} title={t("empty")} />
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-card border-border bg-card border p-4">
              <p className="text-sm">
                <time dateTime={e.at.toISOString()} className="font-tabular">
                  {formatDateTime(e.at, locale as Locale)}
                </time>{" "}
                ·{" "}
                <span className="font-semibold">
                  {e.actor.label ??
                    (e.actor.type === "SYSTEM" ? tActors("system") : tActors("public"))}
                </span>{" "}
                · <span className="font-tabular">{e.action}</span>
              </p>
              {e.reason && <p className="text-muted-foreground mt-1 text-sm">“{e.reason}”</p>}
              <div className="mt-2">
                <DiffTable before={e.before} after={e.after} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
