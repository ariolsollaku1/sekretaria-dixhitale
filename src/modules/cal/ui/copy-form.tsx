"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { copyCalendarAction } from "../server/event.actions";

/** AC-10/AC-11: copy another year's calendar into the (empty) selected year. */
export function CopyCalendarForm({
  toYearId,
  toLabel,
  sources,
}: {
  toYearId: string;
  toLabel: string;
  sources: { id: string; label: string }[];
}) {
  const t = useTranslations("cal.copy");
  const router = useRouter();
  const [from, setFrom] = useState(sources[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await copyCalendarAction({ fromYearId: from, toYearId });
      if (result.ok) {
        toast.success(t("done", { copied: result.data.copied, skipped: result.data.skipped }));
        router.push("/calendar");
        router.refresh();
      } else
        setError(
          result.error.message === "NOT_EMPTY"
            ? t("notEmpty")
            : result.error.message === "YEAR_CLOSED"
              ? t("closed")
              : t("failed"),
        );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-sm">{t("intro", { year: toLabel })}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="copy-from">{t("from")}</Label>
        <Select id="copy-from" value={from} onChange={(e) => setFrom(e.target.value)}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm font-semibold">
          {error}
        </p>
      )}
      <div>
        <Button type="button" disabled={pending || !from} onClick={submit}>
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}
