import { getLocale, getTranslations } from "next-intl/server";
import { localize } from "@/lib/forms/definition";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime, formatPlainDate } from "@/lib/i18n/format";
import type { RequestRow } from "../server/request.queries";

/** AC-8, AC-9: a staff member's requests (own page and history page). Server component. */
export async function RequestsTable({ rows }: { rows: RequestRow[] }) {
  const [t, locale] = await Promise.all([getTranslations("off"), getLocale()]);
  const l = locale as Locale;
  if (rows.length === 0)
    return (
      <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("empty")}</p>
    );
  return (
    <div className="rounded-card border-border bg-card overflow-x-auto border">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            <th scope="col" className="p-3 font-semibold">
              {t("columns.reference")}
            </th>
            <th scope="col" className="p-3 font-semibold">
              {t("columns.type")}
            </th>
            <th scope="col" className="p-3 font-semibold">
              {t("columns.state")}
            </th>
            <th scope="col" className="p-3 font-semibold">
              {t("columns.period")}
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
              <td className="p-3">{localize(r.title, locale)}</td>
              <td className="p-3">{localize(r.stateLabel, locale)}</td>
              <td className="font-tabular p-3">
                {r.from
                  ? `${formatPlainDate(r.from, l)}${r.to ? ` – ${formatPlainDate(r.to, l)}` : ""}`
                  : "—"}
              </td>
              <td className="font-tabular p-3">{formatDateTime(r.submittedAt, l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
