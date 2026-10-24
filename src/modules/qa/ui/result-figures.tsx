import { getLocale, getTranslations } from "next-intl/server";
import type { TargetResult } from "../domain/result-rules";

const pick = (label: { sq: string; en?: string }, locale: string) =>
  locale === "en" && label.en ? label.en : label.sq;

/** AC-8, AC-9: the figures of one target, or the note that there are too few responses. */
export async function ResultFigures({ result }: { result: TargetResult }) {
  const [t, locale] = await Promise.all([getTranslations("qa.results"), getLocale()]);
  if (result.withheld)
    return (
      <p className="rounded-control border-border bg-muted border p-3 text-sm">
        {t("withheld", { min: result.minResponses })}
      </p>
    );
  return (
    <div className="flex flex-col gap-4">
      <p className="font-tabular text-sm">
        {t("responses", { count: result.responses })} · {t("overall")}:{" "}
        <span className="text-lg font-semibold">{result.overall ?? "—"}</span>
      </p>
      <ul className="flex flex-col gap-2">
        {result.questions.map((q) => {
          const max = Math.max(1, ...q.distribution);
          return (
            <li key={q.key} className="rounded-card border-border bg-card border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{pick(q.label, locale)}</p>
                <p className="font-tabular text-lg font-semibold">{q.mean ?? "—"}</p>
              </div>
              <ul className="mt-2 flex flex-col gap-1" aria-label={t("distribution")}>
                {q.distribution.map((n, i) => (
                  <li key={i} className="font-tabular flex items-center gap-2 text-[13px]">
                    <span className="w-4">{i + 1}</span>
                    <span
                      className="bg-primary h-2 rounded"
                      style={{ width: `${(n / max) * 70}%`, minWidth: n > 0 ? 4 : 0 }}
                    />
                    <span className="text-muted-foreground">{n}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {result.comments.map((c) => (
        <section key={c.key} aria-label={pick(c.label, locale)}>
          <h3 className="mb-2 text-sm font-semibold">{pick(c.label, locale)}</h3>
          <ul className="flex flex-col gap-2">
            {c.texts.map((text, i) => (
              <li key={i} className="rounded-card border-border bg-card border p-3 text-sm">
                {text}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
