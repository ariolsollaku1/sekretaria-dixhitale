import { Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { displayMoney, getOwnFinance } from "@/modules/fin";

const STATUS_TONE = {
  PAID: "success",
  PARTIAL: "info",
  UNPAID: "neutral",
  OVERDUE: "danger",
} as const;

// FIN-02 AC-11 (Q-113): a student's own installments, payments and balance, nothing of anybody else's.
export default async function MyPaymentsPage() {
  const user = await requireUser("/fin/mine");
  if (!(await can(user, "fin.payment.self"))) return <ForbiddenView />;
  const [t, tk, tp, own] = await Promise.all([
    getTranslations("fin.mine"),
    getTranslations("fin.kind"),
    getTranslations("fin.payment"),
    getOwnFinance(user),
  ]);
  return (
    <>
      <PageHeader title={t("title")} />
      {own === null ? (
        <EmptyState icon={Wallet} title={t("noStudent")} description={t("noStudentHint")} />
      ) : (
        <>
          <p
            role="status"
            className="rounded-control border-border bg-muted mb-6 flex flex-wrap items-center gap-3 border p-3 text-sm"
          >
            <StatusBadge
              tone={own.cleared ? "success" : "danger"}
              label={tp(own.cleared ? "cleared" : "notCleared")}
            />
            {own.cleared
              ? t("clearedHint", { date: own.today })
              : t("owedHint", { date: own.today, amount: displayMoney(own.owed) })}
          </p>
          {own.plans.length === 0 && (
            <p className="rounded-control border-border bg-muted border p-3 text-sm">
              {t("empty")}
            </p>
          )}
          {own.plans.map((p) => (
            <section key={p.id} aria-labelledby={`plan-${p.id}`} className="mb-10">
              <h2 id={`plan-${p.id}`} className="mb-1 text-lg font-semibold">
                {t("planTitle", { program: p.programCode, year: p.yearCode })}
              </h2>
              <dl className="mb-4 flex flex-wrap gap-8 text-sm">
                {(
                  [
                    ["due", p.due],
                    ["paid", p.paid],
                    ["outstanding", p.outstanding],
                    ["overdue", p.overdue],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{tp(k)}</dt>
                    <dd className="font-tabular text-xl font-semibold">{displayMoney(v)}</dd>
                  </div>
                ))}
                {p.credit !== "0.00" && (
                  <div>
                    <dt className="text-muted-foreground">{tp("credit")}</dt>
                    <dd className="font-tabular text-xl font-semibold">{displayMoney(p.credit)}</dd>
                  </div>
                )}
              </dl>
              <div className="mb-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">{t("installments")}</caption>
                  <thead>
                    <tr className="border-border border-b">
                      {(
                        ["kind", "dueDate", "amount", "paid", "outstanding", "status"] as const
                      ).map((c) => (
                        <th key={c} scope="col" className="py-2 pr-4">
                          {t(`columns.${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.installments.map((i) => (
                      <tr key={i.id} className="border-border border-b align-top">
                        <td className="py-2 pr-4">
                          {tk(i.kind)}
                          {i.label && <span className="text-muted-foreground"> · {i.label}</span>}
                        </td>
                        <td className="font-tabular py-2 pr-4">
                          <time dateTime={i.dueDate}>{i.dueDate}</time>
                          {i.earlyAmount && i.earlyUntil && i.status !== "PAID" && (
                            <span className="text-muted-foreground block text-[13px]">
                              {t("earlyUntil", {
                                amount: displayMoney(i.earlyAmount),
                                date: i.earlyUntil,
                              })}
                            </span>
                          )}
                        </td>
                        <td className="font-tabular py-2 pr-4">{displayMoney(i.amount)}</td>
                        <td className="font-tabular py-2 pr-4">{displayMoney(i.paid)}</td>
                        <td className="font-tabular py-2 pr-4">{displayMoney(i.outstanding)}</td>
                        <td className="py-2 pr-4">
                          <StatusBadge
                            tone={STATUS_TONE[i.status]}
                            label={tp(`status.${i.status}`)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.payments.length > 0 && (
                <>
                  <h3 className="mb-2 font-semibold">{tp("payments")}</h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {p.payments.map((x) => (
                      <li key={x.id} className="font-tabular">
                        <time dateTime={x.paidOn}>{x.paidOn}</time> · {displayMoney(x.amount)} ·{" "}
                        {tp(`methods.${x.method}`)}
                        {x.reference && ` · ${x.reference}`}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
