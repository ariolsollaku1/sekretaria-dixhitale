import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { FileText, Landmark, ReceiptText, Wallet } from "lucide-react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { ScrollBox } from "@/components/ui/scroll-box";
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
      <RecordHero
        icon={Wallet}
        name={plan.studentName}
        subtitle={`${plan.studentNumber} · ${t("summary", { program: plan.programCode, year: plan.yearCode })}`}
        breadcrumbs={[{ label: t("plans"), href: "/fin/plans" }, { label: plan.studentNumber }]}
        badges={
          fin && (
            <StatusBadge
              tone={fin.clearedToday ? "success" : "danger"}
              label={tp(fin.clearedToday ? "cleared" : "notCleared")}
            />
          )
        }
      />
      {plan.yearStatus === "CLOSED" && (
        <p role="status" className="rounded-control border-border bg-muted mb-4 border p-3 text-sm">
          {t("closed")}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
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

          <Card aria-labelledby="installments-h">
            <CardTitle id="installments-h" icon={FileText}>
              {t("installments")}
            </CardTitle>
            <ScrollBox label={t("installments")}>
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
                          ? t("earlyUntil", {
                              amount: displayMoney(i.earlyAmount),
                              date: i.earlyUntil,
                            })
                          : "—"}
                      </td>
                      {fin && (
                        <>
                          <td className="font-tabular py-2 pr-4">
                            {fin.installments[i.id]
                              ? displayMoney(fin.installments[i.id]!.paid)
                              : "—"}
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
                                {i.cancelReason === "SCHOLARSHIP"
                                  ? t("scholarship")
                                  : i.cancelReason}
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
                          <span className="text-muted-foreground ml-2 text-[13px]">
                            {t("adjusted")}
                          </span>
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
            </ScrollBox>
            {editable && (
              <div className="mt-4">
                <AddInstallment planId={plan.id} />
              </div>
            )}
          </Card>
          {scholarships.length > 0 && (
            <Card aria-labelledby="plan-sch">
              <CardTitle id="plan-sch" icon={Landmark}>
                {ts("title")}
              </CardTitle>
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
            </Card>
          )}

          {fin && (
            <Card aria-labelledby="payments-h">
              <CardTitle id="payments-h" icon={ReceiptText}>
                {tp("payments")}
              </CardTitle>
              {fin.payments.length === 0 ? (
                <p className="rounded-control border-border bg-muted border p-3 text-sm">
                  {tp("empty")}
                </p>
              ) : (
                <ScrollBox label={tp("payments")}>
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
                </ScrollBox>
              )}
            </Card>
          )}
        </div>
        <Card aria-labelledby="plan-summary">
          <CardTitle id="plan-summary" icon={Wallet}>
            {t("totals")}
          </CardTitle>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              {
                label: t("total"),
                value: <span className="font-tabular text-lg">{displayMoney(plan.total)}</span>,
              },
              {
                label: t("earlyTotal"),
                value: (
                  <span className="font-tabular text-lg">{displayMoney(plan.earlyTotal)}</span>
                ),
              },
              {
                label: t("count"),
                value: <span className="font-tabular text-lg">{plan.count}</span>,
              },
              ...(fin
                ? [
                    {
                      label: tp("paid"),
                      value: <span className="font-tabular text-lg">{displayMoney(fin.paid)}</span>,
                    },
                    {
                      label: tp("outstanding"),
                      value: (
                        <span className="font-tabular text-lg">
                          {displayMoney(fin.outstanding)}
                        </span>
                      ),
                    },
                    {
                      label: tp("overdue"),
                      value: (
                        <span className="font-tabular text-lg">{displayMoney(fin.overdue)}</span>
                      ),
                    },
                    ...(fin.credit !== "0.00"
                      ? [
                          {
                            label: tp("credit"),
                            value: (
                              <span className="font-tabular text-lg">
                                {displayMoney(fin.credit)}
                              </span>
                            ),
                          },
                        ]
                      : []),
                  ]
                : []),
            ]}
          />
        </Card>
      </div>
    </>
  );
}
