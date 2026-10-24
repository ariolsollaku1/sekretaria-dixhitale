"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { SCHOLARSHIP_CATEGORIES, type ScholarshipType } from "../domain/scholarship-rules";
import { grantScholarshipAction, voidScholarshipAction } from "../server/scholarship.actions";
import { useExplain } from "./explain";

/**
 * AC-2, AC-3: grant a scholarship, either as the decision on an application (`submissionId`) or
 * directly for a student number. "How" is a full scholarship, a percentage, or a fixed amount.
 */
export function GrantScholarshipForm({
  submissionId,
  years,
  defaultYearId,
  defaultCategory,
  heading,
}: {
  submissionId?: string;
  years: { id: string; label: string }[];
  defaultYearId: string;
  defaultCategory?: string;
  heading: string;
}) {
  const t = useTranslations("fin.scholarship");
  const router = useRouter();
  const explain = useExplain();
  const [studentNumber, setStudentNumber] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [academicYearId, setYear] = useState(defaultYearId);
  const [category, setCategory] = useState(
    (SCHOLARSHIP_CATEGORIES as readonly string[]).includes(defaultCategory ?? "")
      ? defaultCategory!
      : "EXCELLENCE",
  );
  const [how, setHow] = useState<"FULL" | "PERCENT" | "AMOUNT">("FULL");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const id = submissionId ? "gs-app" : "gs-direct";
  if (years.length === 0) return null;

  return (
    <form
      className="rounded-card border-border bg-muted/40 mb-6 flex max-w-3xl flex-wrap items-end gap-3 border p-4 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const type: ScholarshipType = how === "FULL" ? "FULL" : "PARTIAL";
          const r = await grantScholarshipAction({
            submissionId: submissionId ?? null,
            studentNumber: submissionId ? null : studentNumber,
            programCode: submissionId ? null : programCode,
            academicYearId,
            type,
            category,
            percent: how === "PERCENT" ? value : null,
            amount: how === "AMOUNT" ? value : null,
            reason,
          } as never);
          if (r.ok) {
            toast.success(r.data.applied ? t("granted") : t("grantedPending"));
            setValue("");
            setReason("");
            setStudentNumber("");
            setProgramCode("");
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="w-full text-lg font-semibold">{heading}</h2>
      {!submissionId && (
        <>
          <div className="flex w-44 flex-col gap-1">
            <Label htmlFor={`${id}-student`} className="text-[12px]">
              {t("form.studentNumber")}
            </Label>
            <Input
              id={`${id}-student`}
              value={studentNumber}
              maxLength={20}
              required
              onChange={(e) => setStudentNumber(e.target.value)}
            />
          </div>
          <div className="flex w-40 flex-col gap-1">
            <Label htmlFor={`${id}-program`} className="text-[12px]">
              {t("form.programCode")}
            </Label>
            <Input
              id={`${id}-program`}
              value={programCode}
              maxLength={40}
              onChange={(e) => setProgramCode(e.target.value)}
            />
          </div>
        </>
      )}
      <div className="flex w-40 flex-col gap-1">
        <Label htmlFor={`${id}-year`} className="text-[12px]">
          {t("form.year")}
        </Label>
        <Select id={`${id}-year`} value={academicYearId} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex w-56 flex-col gap-1">
        <Label htmlFor={`${id}-category`} className="text-[12px]">
          {t("form.category")}
        </Label>
        <Select
          id={`${id}-category`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {SCHOLARSHIP_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex w-56 flex-col gap-1">
        <Label htmlFor={`${id}-how`} className="text-[12px]">
          {t("form.how")}
        </Label>
        <Select id={`${id}-how`} value={how} onChange={(e) => setHow(e.target.value as typeof how)}>
          <option value="FULL">{t("form.howFull")}</option>
          <option value="PERCENT">{t("form.howPercent")}</option>
          <option value="AMOUNT">{t("form.howAmount")}</option>
        </Select>
      </div>
      {how !== "FULL" && (
        <div className="flex w-36 flex-col gap-1">
          <Label htmlFor={`${id}-value`} className="text-[12px]">
            {how === "PERCENT" ? t("form.percent") : t("form.amount")}
          </Label>
          <Input
            id={`${id}-value`}
            inputMode="decimal"
            value={value}
            required
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      )}
      <div className="flex w-full flex-col gap-1">
        <Label htmlFor={`${id}-reason`} className="text-[12px]">
          {t("form.reason")}
        </Label>
        <Textarea
          id={`${id}-reason`}
          value={reason}
          maxLength={1000}
          required
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {t("form.grant")}
      </Button>
      <p className="text-muted-foreground w-full text-[13px]">{t("form.hint")}</p>
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

/** AC-6: void a scholarship with a reason. */
export function VoidScholarshipButton({ id, label }: { id: string; label: string }) {
  const t = useTranslations("fin.scholarship");
  const router = useRouter();
  const explain = useExplain();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("void.open")}
        <span className="sr-only"> {label}</span>
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await voidScholarshipAction({ id, reason } as never);
          if (r.ok) {
            toast.success(t("void.done"));
            setOpen(false);
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex w-64 flex-col gap-1">
        <Label htmlFor={`void-${id}`} className="text-[12px]">
          {t("void.reason")}
        </Label>
        <Input
          id={`void-${id}`}
          value={reason}
          required
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || !reason.trim()}>
        {t("void.confirm")}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        {t("void.close")}
      </Button>
      {error && (
        <p role="alert" className="text-danger w-full text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
