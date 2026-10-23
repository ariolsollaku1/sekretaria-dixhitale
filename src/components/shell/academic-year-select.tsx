"use client";
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
    <div className="flex items-center gap-2">
      <label htmlFor="academic-year-select" className="text-[13px] font-semibold">
        {t("academicYear")}
      </label>
      <select
        id="academic-year-select"
        value={selected ?? ""}
        disabled={pending}
        onChange={(e) => startTransition(() => setAcademicYearAction(e.target.value))}
        className="font-tabular rounded-control border-input bg-card min-h-11 border px-2 text-sm"
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
