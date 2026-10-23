import { useTranslations } from "next-intl";

const show = (v: unknown) =>
  v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v);

/** Field-by-field before/after of an audit entry (already reduced to changed, masked fields). */
export function DiffTable({ before, after }: { before: unknown; after: unknown }) {
  const t = useTranslations("audit.detail");
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  if (fields.length === 0) return <p className="text-muted-foreground text-sm">{t("noChanges")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            <th scope="col" className="py-2 pr-4 font-semibold">
              {t("field")}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {t("before")}
            </th>
            <th scope="col" className="py-2 font-semibold">
              {t("after")}
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f} className="border-border border-b align-top">
              <th scope="row" className="font-tabular py-2 pr-4 text-left font-normal">
                {f}
              </th>
              <td className="font-tabular py-2 pr-4 break-all">{show(b[f])}</td>
              <td className="font-tabular py-2 break-all">{show(a[f])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
