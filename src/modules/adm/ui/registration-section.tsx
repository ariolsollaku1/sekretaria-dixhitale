import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { zonedDay } from "@/lib/i18n/zone";
import { displayMoney } from "@/modules/fin";
import { daysUntil, windowState } from "../domain/deadline";
import type { NoticeDetail } from "../server/notice.queries";

const day = (value: string, locale: Locale) => formatDate(new Date(`${value}T12:00:00Z`), locale);

/** AC-4/AC-5: the campaign data of a registration notice, with the fees read live from FIN-01. */
export async function RegistrationSection({
  notice,
  today = zonedDay(new Date()),
}: {
  notice: NoticeDetail;
  today?: string;
}) {
  const [t, tk, locale] = await Promise.all([
    getTranslations("adm.section"),
    getTranslations("fin.kind"),
    getLocale(),
  ]);
  const l = locale as Locale;
  const left = daysUntil(notice.registrationDeadline, today);

  return (
    <section aria-labelledby="registration-title" className="mb-8 flex max-w-3xl flex-col gap-6">
      <h2 id="registration-title" className="text-lg font-semibold">
        {t("title", { year: notice.yearCode })}
      </h2>

      <p className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {t("deadline")}:{" "}
          <time dateTime={notice.registrationDeadline} className="font-tabular font-semibold">
            {day(notice.registrationDeadline, l)}
          </time>
        </span>
        {left < 0 ? (
          <StatusBadge tone="warning" label={t("deadlinePassed")} />
        ) : (
          <StatusBadge tone="info" label={t("daysLeft", { count: left })} />
        )}
        {notice.programLabel && (
          <span className="text-muted-foreground">{notice.programLabel}</span>
        )}
      </p>

      {notice.documents.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">{t("documents")}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {notice.documents.map((d, i) => (
              <li key={`${i}-${d}`}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {notice.showFees && (
        <div>
          <h3 className="mb-2 font-semibold">{t("fees")}</h3>
          {notice.fees.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noFees")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {notice.fees.map((p) => (
                <div key={p.id} className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="py-1 text-left font-medium">
                      {p.code} — {p.name}
                    </caption>
                    <thead>
                      <tr className="border-border border-b">
                        <th scope="col" className="py-2 pr-4">
                          {t("fee")}
                        </th>
                        <th scope="col" className="py-2 pr-4">
                          {t("amount")}
                        </th>
                        <th scope="col" className="py-2">
                          {t("preferential")}
                        </th>
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
                          <td className="py-2">
                            {i.discounts.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {i.discounts.map((d) => {
                                  const state = windowState(d.validFrom, d.validTo, today);
                                  return (
                                    <li
                                      key={`${d.label}-${d.validFrom}`}
                                      className="flex flex-wrap items-center gap-2"
                                    >
                                      <span>
                                        {d.label && `${d.label}: `}
                                        <span className="font-tabular">
                                          {d.kind === "PERCENT"
                                            ? `−${Number(d.value)}%`
                                            : `−${displayMoney(d.value)}`}
                                        </span>{" "}
                                        {t("window", {
                                          from: day(d.validFrom, l),
                                          to: day(d.validTo, l),
                                        })}
                                      </span>
                                      {state === "running" && (
                                        <StatusBadge tone="success" label={t("runningNow")} />
                                      )}
                                      {state === "ended" && (
                                        <StatusBadge tone="neutral" label={t("ended")} />
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {notice.contractExcerpt && (
        <div>
          <h3 className="mb-2 font-semibold">{t("contract")}</h3>
          <p className="rounded-card border-border bg-card border p-4 text-sm whitespace-pre-line">
            {notice.contractExcerpt}
          </p>
        </div>
      )}
    </section>
  );
}
