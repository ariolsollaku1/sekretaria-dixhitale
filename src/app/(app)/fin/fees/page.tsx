import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { FeeItemForm, ItemActiveButton, displayMoney, feeBoard } from "@/modules/fin";
import { getYear } from "@/modules/org";

// FIN-01 AC-1..AC-5: the fee schedule of the selected academic year, per program.
export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const user = await requireUser("/fin/fees");
  if (!(await can(user, "fin.fee.read"))) return <ForbiddenView />;
  const [t, tk, params, yearId, mayWrite] = await Promise.all([
    getTranslations("fin.fees"),
    getTranslations("fin.kind"),
    searchParams,
    getSelectedAcademicYear(),
    can(user, "fin.fee.write"),
  ]);
  const year = yearId ? await getYear(yearId) : null;
  if (!year)
    return (
      <>
        <PageHeader title={t("title")} />
        <p className="rounded-control border-border bg-muted border p-3 text-sm">{t("noYear")}</p>
      </>
    );
  const all = await feeBoard(user, year.id);
  const programs = params.program ? all.filter((p) => p.code === params.program) : all;
  const editable = mayWrite && year.status !== "CLOSED";

  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted-foreground mb-4 text-sm">{t("forYear", { year: year.code })}</p>
      {year.status === "CLOSED" && (
        <p role="status" className="rounded-control border-border bg-muted mb-4 border p-3 text-sm">
          {t("closed")}
        </p>
      )}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-program">{t("program")}</Label>
          <Select id="f-program" name="program" defaultValue={params.program ?? ""}>
            <option value="">{t("all")}</option>
            {all.map((p) => (
              <option key={p.id} value={p.code}>
                {p.code}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          {t("filter")}
        </Button>
      </form>

      <div className="flex flex-col gap-8">
        {programs.map((p) => (
          <section key={p.id} aria-labelledby={`p-${p.id}`} className="flex flex-col gap-3">
            <h2 id={`p-${p.id}`} className="text-lg font-semibold">
              {p.code} — {p.name}
            </h2>
            {p.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">{`${p.code} — ${t("title")}`}</caption>
                  <thead>
                    <tr className="border-border border-b">
                      <th scope="col" className="py-2 pr-4">
                        {t("columns.kind")}
                      </th>
                      <th scope="col" className="py-2 pr-4">
                        {t("columns.amount")}
                      </th>
                      <th scope="col" className="py-2 pr-4">
                        {t("columns.installments")}
                      </th>
                      <th scope="col" className="py-2 pr-4">
                        {t("columns.discounts")}
                      </th>
                      <th scope="col" className="py-2 pr-4">
                        {t("columns.status")}
                      </th>
                      {editable && (
                        <th scope="col" className="py-2">
                          <span className="sr-only">{t("columns.actions")}</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {p.items.map((i) => (
                      <tr key={i.id} className="border-border border-b align-top">
                        <td className="py-2 pr-4">
                          {tk(i.kind)}
                          {i.label && <span className="text-muted-foreground"> · {i.label}</span>}
                        </td>
                        <td className="font-tabular py-2 pr-4">{displayMoney(i.amount)}</td>
                        <td className="py-2 pr-4">
                          {i.installments.length === 0 ? (
                            <span className="text-muted-foreground">{t("singleInstallment")}</span>
                          ) : (
                            <ul>
                              {i.installments.map((n) => (
                                <li key={n.dueDate} className="font-tabular">
                                  <time dateTime={n.dueDate}>{n.dueDate}</time> —{" "}
                                  {displayMoney(n.amount)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <ul>
                            {i.discounts.map((d, n) => (
                              <li key={n} className="font-tabular">
                                {d.label && `${d.label}: `}
                                {d.kind === "PERCENT"
                                  ? `${displayMoney(d.value)}%`
                                  : displayMoney(d.value)}{" "}
                                ({d.validFrom} – {d.validTo})
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="py-2 pr-4">
                          <StatusBadge
                            tone={i.active ? "success" : "neutral"}
                            label={t(i.active ? "active" : "inactive")}
                          />
                        </td>
                        {editable && (
                          <td className="flex flex-col gap-2 py-2">
                            <FeeItemForm
                              programId={p.id}
                              academicYearId={year.id}
                              item={{
                                id: i.id,
                                kind: i.kind,
                                label: i.label,
                                amount: i.amount,
                                installments: i.installments,
                                discounts: i.discounts,
                              }}
                            />
                            <ItemActiveButton itemId={i.id} active={i.active} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {editable && <FeeItemForm programId={p.id} academicYearId={year.id} />}
          </section>
        ))}
      </div>
    </>
  );
}
