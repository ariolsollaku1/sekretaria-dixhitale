import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { stateDef } from "@/lib/forms/answers";
import { localize } from "@/lib/forms/definition";
import { mySubmissions } from "@/lib/forms/queries";

export default async function MySubmissionsPage() {
  const user = await requireUser("/forms/mine");
  const [t, locale, rows] = await Promise.all([
    getTranslations("forms"),
    getLocale(),
    mySubmissions(user.id),
  ]);
  return (
    <>
      <PageHeader
        title={t("mine.title")}
        breadcrumbs={[{ label: t("title"), href: "/forms" }, { label: t("mine.title") }]}
      />
      {rows.length === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("mine.empty")}
        </p>
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.reference")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.form")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.state")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.submittedAt")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <th scope="row" className="font-tabular p-3 text-left font-semibold">
                    {r.reference}
                  </th>
                  <td className="p-3">{localize(r.form.definition.title, locale)}</td>
                  <td className="p-3">
                    {localize(stateDef(r.form.definition, r.state)?.label, locale) || r.state}
                  </td>
                  <td className="font-tabular p-3">
                    {formatDateTime(r.submittedAt, locale as Locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
