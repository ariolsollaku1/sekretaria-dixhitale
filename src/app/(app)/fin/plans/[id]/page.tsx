import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  AddInstallment,
  InstallmentActions,
  RecordPayment,
  VoidPayment,
  displayMoney,
  getPlan,
  getPlanFinance,
  listPlanScholarships,
  VoidScholarshipButton,
} from "@/modules/fin";

const STATUS_TONE = {
  PAID: "success",
  PARTIAL: "info",
  UNPAID: "neutral",
  OVERDUE: "danger",
} as const;

// FIN-01 AC-8, AC-9; FIN-02 AC-10: one payment plan with its installments and totals; Finance adjusts it.
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/fin/plans/${id}`);
  if (!(await can(user, "fin.plan.read"))) return <ForbiddenView />;
  const plan = await getPlan(user, id);
  if (!plan) notFound();
  const [t, tk, tp, ts, mayWrite, mayReadPay, mayWritePay, mayVoid, scholarships] =
    await Promise.all([
      getTranslations("fin.plan"),
      getTranslations("fin.kind"),
      getTranslations("fin.payment"),
      getTranslations("fin.scholarship"),
      can(user, "fin.plan.write"),
      can(user, "fin.payment.read"),
      can(user, "fin.payment.write"),
      can(user, "fin.scholarship.write"),
      can(user, "fin.scholarship.read").then((ok) => (ok ? listPlanScholarships(user, id) : [])),
    ]);
  const fin = mayReadPay ? await getPlanFinance(user, id) : null;
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
        {fin && (
          <>
            <div>
              <dt className="text-muted-foreground">{tp("paid")}</dt>
              <dd className="font-tabular text-xl font-semibold">{displayMoney(fin.paid)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{tp("outstanding")}</dt>
              <dd className="font-tabular text-xl font-semibold">
                {displayMoney(fin.outstanding)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{tp("overdue")}</dt>
              <dd className="font-tabular text-xl font-semibold">{displayMoney(fin.overdue)}</dd>
            </div>
            {fin.credit !== "0.00" && (
              <div>
                <dt className="text-muted-foreground">{tp("credit")}</dt>
                <dd className="font-tabular text-xl font-semibold">{displayMoney(fin.credit)}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">{tp("clearance")}</dt>
              <dd>
                <StatusBadge
                  tone={fin.clearedToday ? "success" : "danger"}
                  label={tp(fin.clearedToday ? "cleared" : "notCleared")}
                />
              </dd>
            </div>
          </>
        )}
      </dl>
      {fin && mayWritePay && (
        <RecordPayment
          planId={plan.id}
          today={fin.today}
          installments={plan.installments
            .filter((i) => i.status === "ACTIVE")
            .map((i) => ({
              id: i.id,
              label: `${i.sequence} · ${tk(i.kind)} · ${i.dueDate}`,
            }))}
        />
      )}

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
              {fin && (
                <>
                  <th scope="col" className="py-2 pr-4">
                    {tp("paid")}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {tp("outstanding")}
                  </th>
                </>
              )}
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
                {fin && (
                  <>
                    <td className="font-tabular py-2 pr-4">
                      {fin.installments[i.id] ? displayMoney(fin.installments[i.id]!.paid) : "—"}
                    </td>
                    <td className="font-tabular py-2 pr-4">
                      {fin.installments[i.id]
                        ? displayMoney(fin.installments[i.id]!.outstanding)
                        : "—"}
                    </td>
                  </>
                )}
                <td className="py-2 pr-4">
                  {i.status === "CANCELLED" ? (
                    <>
                      <StatusBadge tone="neutral" label={t("cancelled")} />
                      {i.cancelReason && (
                        <span className="ml-2 text-[13px]">
                          {i.cancelReason === "SCHOLARSHIP" ? t("scholarship") : i.cancelReason}
                        </span>
                      )}
                    </>
                  ) : fin?.installments[i.id] ? (
                    <StatusBadge
                      tone={STATUS_TONE[fin.installments[i.id]!.status]}
                      label={tp(`status.${fin.installments[i.id]!.status}`)}
                    />
                  ) : i.adjusted ? (
                    <StatusBadge tone="info" label={t("adjusted")} />
                  ) : (
                    <StatusBadge tone="success" label={t("active")} />
                  )}
                  {i.adjusted && i.status === "ACTIVE" && fin && (
                    <span className="text-muted-foreground ml-2 text-[13px]">{t("adjusted")}</span>
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
      {scholarships.length > 0 && (
        <section aria-labelledby="plan-sch" className="mt-8">
          <h2 id="plan-sch" className="mb-3 text-2xl font-semibold">
            {ts("title")}
          </h2>
          <ul className="flex max-w-3xl flex-col gap-3 text-sm">
            {scholarships.map((s) => (
              <li
                key={s.id}
                className="border-border flex flex-wrap items-center gap-3 border-b pb-3"
              >
                <span>
                  {ts(`type.${s.type}`)} · {ts(`category.${s.category}`)} ·{" "}
                  <span className="font-tabular">
                    {s.type === "FULL" ? "100 %" : s.percent ? `${s.percent} %` : s.amount}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {s.voidedAt ? `${ts("status.VOID")} · ${s.voidReason ?? ""}` : s.reason}
                </span>
                {mayVoid && editable && !s.voidedAt && (
                  <VoidScholarshipButton id={s.id} label={s.yearCode} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {fin && (
        <section aria-labelledby="payments-h" className="mt-8">
          <h2 id="payments-h" className="mb-3 text-lg font-semibold">
            {tp("payments")}
          </h2>
          {fin.payments.length === 0 ? (
            <p className="rounded-control border-border bg-muted border p-3 text-sm">
              {tp("empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{tp("payments")}</caption>
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className="py-2 pr-4">
                      {tp("paidOn")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {tp("amount")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {tp("method")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {tp("reference")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {tp("forInstallment")}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t("columns.status")}
                    </th>
                    {mayWritePay && (
                      <th scope="col" className="py-2">
                        <span className="sr-only">{t("columns.actions")}</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {fin.payments.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-border border-b align-top ${p.status === "VOIDED" ? "text-muted-foreground line-through" : ""}`}
                    >
                      <td className="font-tabular py-2 pr-4">
                        <time dateTime={p.paidOn}>{p.paidOn}</time>
                      </td>
                      <td className="font-tabular py-2 pr-4">{displayMoney(p.amount)}</td>
                      <td className="py-2 pr-4">{tp(`methods.${p.method}`)}</td>
                      <td className="py-2 pr-4">{p.reference || "—"}</td>
                      <td className="font-tabular py-2 pr-4">{p.installmentSequence ?? "—"}</td>
                      <td className="py-2 pr-4 no-underline">
                        {p.status === "VOIDED" ? (
                          <>
                            <StatusBadge tone="neutral" label={tp("voidedBadge")} />
                            {p.voidReason && (
                              <span className="ml-2 text-[13px]">{p.voidReason}</span>
                            )}
                          </>
                        ) : p.imported ? (
                          <StatusBadge tone="info" label={tp("imported")} />
                        ) : (
                          <StatusBadge tone="success" label={tp("recorded")} />
                        )}
                      </td>
                      {mayWritePay && (
                        <td className="py-2">
                          {p.status === "RECORDED" && <VoidPayment paymentId={p.id} />}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
