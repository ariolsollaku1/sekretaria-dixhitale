"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { allowedTransitions, canTransfer } from "../domain/status-rules";
import type { EnrollmentStatus } from "../domain/student-rules";
import { changeStatusAction, transferAction } from "../server/status.actions";

type Cohort = { id: string; programId: string; program: string; label: string };
type Kind = "SUSPENDED" | "ACTIVE" | "DEREGISTERED" | "GRADUATED" | "TRANSFER";
const ACTION_KEY: Record<Kind, string> = {
  SUSPENDED: "suspend",
  ACTIVE: "resume",
  DEREGISTERED: "deregister",
  GRADUATED: "graduate",
  TRANSFER: "transfer",
};

function ChangeDialog({
  enrollmentId,
  kind,
  cohorts,
}: {
  enrollmentId: string;
  kind: Kind;
  cohorts: Cohort[];
}) {
  const t = useTranslations("stu.change");
  const tc = useTranslations("common");
  const router = useRouter();
  const key = ACTION_KEY[kind];
  const dyn = t as unknown as (k: string) => string;
  const [open, setOpen] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [documentRef, setDocumentRef] = useState("");
  const [reason, setReason] = useState("");
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const explain = (r: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    if (r.error.fieldErrors?.reason) return t("errors.reasonRequired");
    const code = r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : r.error.message;
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const base = { enrollmentId, effectiveDate, documentRef: documentRef || null, reason };
      const cohort = cohorts.find((c) => c.id === cohortId);
      const result =
        kind === "TRANSFER"
          ? cohort
            ? await transferAction({
                ...base,
                programId: cohort.programId,
                cohortId: cohort.id,
              } as never)
            : null
          : await changeStatusAction({ ...base, to: kind } as never);
      if (!result) setError(t("errors.cohortRequired"));
      else if (result.ok) {
        toast.success(t("done"));
        setOpen(false);
        router.refresh();
      } else setError(explain(result));
    } finally {
      setPending(false);
    }
  }

  const destructive = kind === "DEREGISTERED" || kind === "TRANSFER";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={kind === "DEREGISTERED" ? "destructive" : "secondary"}>
          {dyn(`${key}.action`)}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">{dyn(`${key}.title`)}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {dyn(`${key}.body`)}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-3">
          {kind === "TRANSFER" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`tc-${enrollmentId}`}>{t("targetCohort")}</Label>
              {cohorts.length === 0 ? (
                <p id={`tc-${enrollmentId}`} className="text-sm">
                  {t("noCohorts")}
                </p>
              ) : (
                <Select
                  id={`tc-${enrollmentId}`}
                  value={cohortId}
                  onChange={(e) => setCohortId(e.target.value)}
                >
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.program} · {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ed-${enrollmentId}-${kind}`}>{t("effectiveDate")}</Label>
            <Input
              id={`ed-${enrollmentId}-${kind}`}
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`dr-${enrollmentId}-${kind}`}>{t("documentRef")}</Label>
            <Input
              id={`dr-${enrollmentId}-${kind}`}
              value={documentRef}
              onChange={(e) => setDocumentRef(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rs-${enrollmentId}-${kind}`}>{t("reason")}</Label>
            <Textarea
              id={`rs-${enrollmentId}-${kind}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? `er-${enrollmentId}-${kind}` : undefined}
            />
          </div>
          {error && (
            <p
              id={`er-${enrollmentId}-${kind}`}
              role="alert"
              className="text-danger text-[13px] font-semibold"
            >
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{tc("cancel")}</Button>
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "primary"}
            disabled={pending}
            onClick={submit}
          >
            {dyn(`${key}.action`)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** AC-6: the changes the state machine allows for this enrollment. */
export function StatusChange({
  enrollmentId,
  status,
  cohorts,
}: {
  enrollmentId: string;
  status: EnrollmentStatus;
  cohorts: Cohort[];
}) {
  const kinds: Kind[] = [...allowedTransitions(status)];
  if (canTransfer(status)) kinds.push("TRANSFER");
  if (kinds.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {kinds.map((k) => (
        <ChangeDialog key={k} enrollmentId={enrollmentId} kind={k} cohorts={cohorts} />
      ))}
    </div>
  );
}
