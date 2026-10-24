import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { AddInstallment, InstallmentActions, displayMoney, getPlan } from "@/modules/fin";

// FIN-01 AC-8, AC-9: one payment plan with its installments and totals; Finance adjusts it.
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/fin/plans/${id}`);
  if (!(await can(user, "fin.plan.read"))) return <ForbiddenView />;
  const plan = await getPlan(user, id);
  if (!plan) notFound();
  const [t, tk, mayWrite] = await Promise.all([
    getTranslations("fin.plan"),
    getTranslations("fin.kind"),
    can(user, "fin.plan.write"),
  ]);
  const editable = mayWrite && plan.yearStatus !== "CLOSED";
  return (
    <>
      <PageHeader
        title={`${plan.studentNumber} · ${plan.studentName}`}
        breadcrumbs={[{ label: t("plans"), href: "/fin/plans" }, { label: plan.studentNumber }]}
      />
      <p className="text-muted-foreground mb-4 text-sm">
        {t("summary", { program: plan.programCode, year: plan.yearCode })}
      </p>
      {plan.yearStatus === "CLOSED" && (
        <p role="status" className="rounded-control border-border bg-muted mb-4 border p-3 text-sm">
          {t("closed")}
        </p>
      )}
      <dl className="mb-6 flex flex-wrap gap-8 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("total")}</dt>
          <dd className="font-tabular text-xl font-semibold">{displayMoney(plan.total)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("earlyTotal")}</dt>
          <dd className="font-tabular text-xl font-semibold">{displayMoney(plan.earlyTotal)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("count")}</dt>
          <dd className="font-tabular text-xl font-semibold">{plan.count}</dd>
        </div>
      </dl>

      <div className="mb-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t("installments")}</caption>
          <thead>
            <tr className="border-border border-b">
              <th scope="col" className="py-2 pr-4">
                {t("columns.sequence")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("columns.kind")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("columns.dueDate")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("columns.amount")}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t("columns.early")}
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
            {plan.installments.map((i) => (
              <tr
                key={i.id}
                className={`border-border border-b align-top ${i.status === "CANCELLED" ? "text-muted-foreground" : ""}`}
              >
                <td className="font-tabular py-2 pr-4">{i.sequence}</td>
                <td className="py-2 pr-4">
                  {tk(i.kind)}
                  {i.label && <span className="text-muted-foreground"> · {i.label}</span>}
                </td>
                <td className="font-tabular py-2 pr-4">
                  <time dateTime={i.dueDate}>{i.dueDate}</time>
                </td>
                <td className="font-tabular py-2 pr-4">{displayMoney(i.amount)}</td>
                <td className="font-tabular py-2 pr-4">
                  {i.earlyAmount && i.earlyUntil
                    ? t("earlyUntil", { amount: displayMoney(i.earlyAmount), date: i.earlyUntil })
                    : "—"}
                </td>
                <td className="py-2 pr-4">
                  {i.status === "CANCELLED" ? (
                    <>
                      <StatusBadge tone="neutral" label={t("cancelled")} />
                      {i.cancelReason && <span className="ml-2 text-[13px]">{i.cancelReason}</span>}
                    </>
                  ) : i.adjusted ? (
                    <StatusBadge tone="info" label={t("adjusted")} />
                  ) : (
                    <StatusBadge tone="success" label={t("active")} />
                  )}
                </td>
                {editable && (
                  <td className="py-2">
                    {i.status === "ACTIVE" && (
                      <InstallmentActions
                        installmentId={i.id}
                        amount={i.amount}
                        dueDate={i.dueDate}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <AddInstallment planId={plan.id} />}
    </>
  );
}
