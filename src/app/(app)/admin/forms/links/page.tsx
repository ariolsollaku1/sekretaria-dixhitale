import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { env } from "@/lib/env";
import { localize } from "@/lib/forms/definition";
import { formUrl, indexUrl } from "@/lib/forms/links";
import { listPublicForms } from "@/lib/forms/queries";

// INT-06 AC-5: the addresses to hand to whoever maintains the LOGOS website (link only, Q-06).
export default async function FormLinksPage() {
  const user = await requireUser("/admin/forms/links");
  if (!(await can(user, "plt.form.manage"))) return <ForbiddenView />;
  const [t, locale, forms] = await Promise.all([
    getTranslations("forms.links"),
    getLocale(),
    listPublicForms(),
  ]);
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{t("intro")}</p>
      <div className="rounded-card border-border bg-card overflow-x-auto border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th scope="col" className="p-3 font-semibold">
                {t("columns.form")}
              </th>
              <th scope="col" className="p-3 font-semibold">
                {t("columns.version")}
              </th>
              <th scope="col" className="p-3 font-semibold">
                {t("columns.address")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-border border-b">
              <th scope="row" className="p-3 text-left font-semibold">
                {t("index")}
              </th>
              <td className="p-3">—</td>
              <td className="p-3">
                <code data-testid="link-index">{indexUrl(env.APP_URL)}</code>
              </td>
            </tr>
            {forms.map((f) => (
              <tr key={f.key} className="border-border border-b last:border-0">
                <th scope="row" className="p-3 text-left font-semibold">
                  {localize(f.definition.title, locale)}
                </th>
                <td className="font-tabular p-3">{f.version}</td>
                <td className="p-3">
                  <code data-testid={`link-${f.key}`}>{formUrl(env.APP_URL, f.key)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {forms.length === 0 && <p className="text-muted-foreground mt-3 text-sm">{t("none")}</p>}
      <p className="mt-4 text-sm">
        <Link href="/admin/forms" className="underline">
          {t("back")}
        </Link>
      </p>
    </>
  );
}
