"use client";
import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { setAcademicYearAction } from "@/lib/academic-year/actions";

export type AcademicYearView = {
  options: { id: string; label: string }[];
  selected: string | null;
};

/** Fixed header slot (ADR-0006). The parent renders it only when years exist (AC-7). */
export function AcademicYearSelect({ options, selected }: AcademicYearView) {
  const t = useTranslations("shell");
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-control bg-card ring-border flex items-center gap-2 pl-3 shadow-sm ring-1">
      <CalendarDays className="text-brand size-4" aria-hidden />
      <label htmlFor="academic-year-select" className="sr-only">
        {t("academicYear")}
      </label>
      <select
        id="academic-year-select"
        value={selected ?? ""}
        disabled={pending}
        onChange={(e) => startTransition(() => setAcademicYearAction(e.target.value))}
        className="font-tabular rounded-control min-h-11 bg-transparent pr-2 text-sm font-semibold"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
