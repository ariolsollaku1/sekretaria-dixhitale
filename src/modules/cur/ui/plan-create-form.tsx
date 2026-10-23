"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { createPlanAction } from "../server/plan.actions";

type Props = {
  programs: { id: string; label: string }[];
  years: { id: string; label: string }[];
  /** existing plans of the writable programs, for "copy from" */
  plans: { id: string; programId: string; version: number; status: string; validFrom: string }[];
  defaultYearId: string;
};

/** AC-6: choose the program and the year it applies from, optionally start from an existing plan. */
export function PlanCreateForm({ programs, years, plans, defaultYearId }: Props) {
  const t = useTranslations("cur.plan");
  const router = useRouter();
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [yearId, setYearId] = useState(defaultYearId);
  const [copyFrom, setCopyFrom] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = plans.filter((p) => p.programId === programId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await createPlanAction({
        programId,
        validFromAcademicYearId: yearId,
        copyFromPlanId: copyFrom || null,
        notes: notes || null,
      });
      if (result.ok) {
        toast.success(t("created", { version: result.data.version }));
        router.push(`/cur/plans/${result.data.planId}`);
        router.refresh();
      } else {
        const key = result.error.fieldErrors
          ? Object.values(result.error.fieldErrors)[0]?.[0]
          : result.error.message;
        setError(
          key && t.has(`errors.${key}` as never)
            ? t(`errors.${key}` as never)
            : t("errors.generic"),
        );
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-program">{t("form.program")}</Label>
        <Select
          id="plan-program"
          value={programId}
          onChange={(e) => {
            setProgramId(e.target.value);
            setCopyFrom("");
          }}
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-year">{t("form.validFrom")}</Label>
        <Select id="plan-year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-copy">{t("form.copyFrom")}</Label>
        <Select id="plan-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
          <option value="">{t("form.copyNone")}</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {t("form.copyOption", {
                version: p.version,
                status: t(`status.${p.status}` as never),
                year: p.validFrom,
              })}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-notes">{t("form.notes")}</Label>
        <Textarea id="plan-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm font-semibold">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || !programId || !yearId}>
          {t("form.create")}
        </Button>
      </div>
    </form>
  );
}
