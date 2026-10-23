"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { createCohortAction } from "../server/cohort.actions";

type Plan = { id: string; programId: string; label: string };

/** AC-1/AC-2: the plan choices follow the selected program (approved plans only). */
export function CohortForm({
  programs,
  years,
  plans,
  defaultYearId,
}: {
  programs: { id: string; label: string }[];
  years: { id: string; label: string }[];
  plans: Plan[];
  defaultYearId: string;
}) {
  const t = useTranslations("org.cohort");
  const router = useRouter();
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [yearId, setYearId] = useState(defaultYearId);
  const [planId, setPlanId] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = plans.filter((p) => p.programId === programId);
  const chosenPlan = options.some((p) => p.id === planId) ? planId : (options[0]?.id ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await createCohortAction({
        programId,
        startAcademicYearId: yearId,
        curriculumPlanId: chosenPlan,
        name,
      });
      if (result.ok) {
        toast.success(t("created"));
        router.push(`/org/cohorts/${result.data.cohortId}`);
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
        <Label htmlFor="cohort-program">{t("form.program")}</Label>
        <Select
          id="cohort-program"
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cohort-year">{t("form.startYear")}</Label>
        <Select id="cohort-year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cohort-plan">{t("form.plan")}</Label>
        {options.length === 0 ? (
          <p id="cohort-plan" className="rounded-control border-border bg-muted border p-3 text-sm">
            {t("form.noApprovedPlan")}
          </p>
        ) : (
          <Select id="cohort-plan" value={chosenPlan} onChange={(e) => setPlanId(e.target.value)}>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cohort-name">{t("form.name")}</Label>
        <Input id="cohort-name" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-muted-foreground text-[13px]">{t("form.nameHint")}</p>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm font-semibold">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || !programId || !chosenPlan || !name.trim()}>
          {t("form.create")}
        </Button>
      </div>
    </form>
  );
}
