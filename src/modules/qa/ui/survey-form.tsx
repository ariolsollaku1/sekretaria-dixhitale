"use client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import type { Question } from "../domain/question-rules";
import { submitSurveyAction } from "../server/qa.actions";
import { useExplain } from "./explain";

const SCALE = [1, 2, 3, 4, 5] as const;

/**
 * AC-5, AC-13: one block per question, big 1–5 buttons that fit a phone, comments optional. The
 * page tells the student that the answers are anonymous.
 */
export function SurveyFormView({
  campaignId,
  target,
  questions,
}: {
  campaignId: string;
  target: string;
  questions: Question[];
}) {
  const t = useTranslations("qa");
  const locale = useLocale();
  const router = useRouter();
  const explain = useExplain();
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const label = (q: Question) => (locale === "en" && q.label.en ? q.label.en : q.label.sq);
  const missing = questions.some((q) => q.type === "SCALE" && answers[q.key] === undefined);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await submitSurveyAction({ campaignId, target, answers });
          if (r.ok) {
            toast.success(t("survey.sent"));
            router.push("/qa/surveys");
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      {questions.map((q) => (
        <fieldset key={q.key} className="rounded-card border-border bg-card border p-3">
          <legend className="px-1 text-sm font-semibold">{label(q)}</legend>
          {q.type === "SCALE" ? (
            <>
              <div className="mt-2 flex gap-2">
                {SCALE.map((n) => (
                  <label
                    key={n}
                    className="rounded-control border-input has-[:checked]:border-primary has-[:checked]:bg-accent font-tabular flex min-h-11 flex-1 cursor-pointer items-center justify-center border text-base font-semibold has-[:focus-visible]:ring-2"
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={`q-${q.key}`}
                      value={n}
                      checked={answers[q.key] === n}
                      onChange={() => setAnswers({ ...answers, [q.key]: n })}
                    />
                    {n}
                  </label>
                ))}
              </div>
              <p className="text-muted-foreground mt-1 text-[12px]">{t("survey.scaleHint")}</p>
            </>
          ) : (
            <Textarea
              className="mt-2"
              aria-label={label(q)}
              maxLength={2000}
              value={(answers[q.key] as string | undefined) ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
            />
          )}
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || missing}>
        {t("survey.submit")}
      </Button>
    </form>
  );
}
