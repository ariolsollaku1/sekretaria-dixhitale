"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { copyAssignmentsAction } from "../server/teaching.actions";

/** AC-5: copy another year's assignments into the selected year. */
export function TeachingCopy({
  toYearId,
  toLabel,
  sources,
}: {
  toYearId: string;
  toLabel: string;
  sources: { id: string; label: string }[];
}) {
  const t = useTranslations("cur.teaching.copy");
  const router = useRouter();
  const [from, setFrom] = useState(sources[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  async function submit() {
    setPending(true);
    try {
      const r = await copyAssignmentsAction({ fromYearId: from, toYearId });
      if (r.ok) {
        toast.success(t("done", r.data));
        router.refresh();
      } else toast.error(r.error.message === "YEAR_CLOSED" ? t("closed") : t("failed"));
    } finally {
      setPending(false);
    }
  }
  if (sources.length === 0) return null;
  return (
    <div className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4 print:hidden">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="copy-from-year">{t("from")}</Label>
        <Select id="copy-from-year" value={from} onChange={(e) => setFrom(e.target.value)}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="button" variant="secondary" disabled={pending || !from} onClick={submit}>
        {t("submit", { year: toLabel })}
      </Button>
    </div>
  );
}
