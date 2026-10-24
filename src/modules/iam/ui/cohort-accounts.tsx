"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import type { SkipReason } from "../domain/account-rules";
import { provisionCohortAction } from "../server/account.actions";

type Summary = {
  created: number;
  reminded: number;
  skipped: number;
  reasons: Partial<Record<SkipReason, number>>;
};

/** AC-10: create the missing accounts of a cohort and remind those who never activated. */
export function CohortAccounts({ cohorts }: { cohorts: { id: string; label: string }[] }) {
  const t = useTranslations("iam.accounts");
  const router = useRouter();
  const [cohortId, setCohortId] = useState("");
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function run() {
    setPending(true);
    setSummary(null);
    try {
      const result = await provisionCohortAction({ cohortId });
      if (result.ok) {
        setSummary(result.data);
        toast.success(t("cohort.done"));
        router.refresh();
      } else
        toast.error(
          t.has(`errors.${result.error.code}` as never)
            ? t(`errors.${result.error.code}` as never)
            : t("errors.generic"),
        );
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="cohort-accounts-title" className="mb-8 max-w-2xl">
      <h2 id="cohort-accounts-title" className="mb-2 text-2xl font-semibold">
        {t("cohort.title")}
      </h2>
      <p className="text-muted-foreground mb-3 text-sm">{t("cohort.hint")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cohort-accounts-select">{t("cohort.pick")}</Label>
          <Select
            id="cohort-accounts-select"
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
          >
            <option value="">{t("cohort.choose")}</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" onClick={run} disabled={pending || !cohortId}>
          {t("cohort.send")}
        </Button>
      </div>
      {summary && (
        <div role="status" className="mt-4 text-sm">
          <p>
            {t("cohort.result", {
              created: summary.created,
              reminded: summary.reminded,
              skipped: summary.skipped,
            })}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {(Object.entries(summary.reasons) as [SkipReason, number][]).map(([reason, n]) => (
              <li key={reason}>
                {t(`skip.${reason}`)}: {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
