"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { generatePlansAction } from "../server/fin.actions";
import { useExplain } from "./explain";

/** AC-6: generate the plans of a program for the selected year, or of one student. */
export function GeneratePlansForm({
  academicYearId,
  yearLabel,
  programs,
}: {
  academicYearId: string;
  yearLabel: string;
  programs: { id: string; label: string }[];
}) {
  const t = useTranslations("fin.generate");
  const router = useRouter();
  const explain = useExplain();
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [studentNumber, setStudentNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (programs.length === 0) return null;
  return (
    <form
      className="rounded-card border-border bg-muted/40 mb-6 flex flex-wrap items-end gap-3 border p-4 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await generatePlansAction({
            academicYearId,
            programId,
            studentNumber: studentNumber || null,
          });
          if (r.ok) {
            toast.success(t("done", r.data));
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="w-full text-lg font-semibold">{t("title", { year: yearLabel })}</h2>
      <div className="flex min-w-60 flex-col gap-1">
        <Label htmlFor="gen-program" className="text-[12px]">
          {t("program")}
        </Label>
        <Select id="gen-program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex w-44 flex-col gap-1">
        <Label htmlFor="gen-student" className="text-[12px]">
          {t("studentNumber")}
        </Label>
        <Input
          id="gen-student"
          value={studentNumber}
          maxLength={20}
          onChange={(e) => setStudentNumber(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || !programId}>
        {t("submit")}
      </Button>
      <p className="text-muted-foreground w-full text-[13px]">{t("hint")}</p>
      {error && (
        <p
          role="alert"
          className="rounded-control border-danger text-danger w-full border p-3 text-sm"
        >
          {error}
        </p>
      )}
    </form>
  );
}
