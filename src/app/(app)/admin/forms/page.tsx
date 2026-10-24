import { FileText } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { listDefinitions } from "@/lib/forms/queries";

const TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};

export default async function AdminFormsPage() {
  const user = await requireUser("/admin/forms");
  if (!(await can(user, "plt.form.manage"))) return <ForbiddenView />;
  const [t, rows] = await Promise.all([getTranslations("forms.admin"), listDefinitions()]);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/forms/links" className={buttonVariants({ variant: "secondary" })}>
              {t("websiteLinks")}
            </Link>
            <Link href="/admin/forms/new" className={buttonVariants()}>
              {t("new")}
            </Link>
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="p-3 font-semibold">
                  {t("key")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.version")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.title")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("audience")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.status")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.submissions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <th scope="row" className="p-3 text-left font-semibold">
                    <Link href={`/admin/forms/${r.id}`} className="underline">
                      {r.key}
                    </Link>
                  </th>
                  <td className="font-tabular p-3">{r.version}</td>
                  <td className="p-3">{r.title}</td>
                  <td className="p-3">
                    {t(r.audience === "PUBLIC" ? "audiencePublic" : "audienceAuthenticated")}
                  </td>
                  <td className="p-3">
                    <StatusBadge tone={TONE[r.status]!} label={t(`status.${r.status}`)} />
                  </td>
                  <td className="font-tabular p-3">{r.submissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
