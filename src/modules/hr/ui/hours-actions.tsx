"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  addAdjustmentAction,
  approveMonthAction,
  reopenMonthAction,
} from "../server/hours.actions";

type Failure = { error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

function useExplain() {
  const t = useTranslations("hr.hours.errors");
  return (r: Failure) => {
    if (r.error.code === "FORBIDDEN") return t("FORBIDDEN");
    const field = r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : undefined;
    const code = field ?? r.error.message;
    return t.has(code as never) ? t(code as never) : t("generic");
  };
}

/** AC-6/AC-8/AC-9: approve, reopen and adjust the month of one lecturer. */
export function HoursActions({
  staffId,
  month,
  state,
  canApprove,
  canAdjust,
  assignments,
}: {
  staffId: string;
  month: string;
  state: "PENDING" | "APPROVED" | "CHANGED" | "OPEN";
  canApprove: boolean;
  canAdjust: boolean;
  assignments: { id: string; label: string }[];
}) {
  const t = useTranslations("hr.hours");
  const router = useRouter();
  const explain = useExplain();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [adj, setAdj] = useState({
    assignmentId: assignments[0]?.id ?? "",
    hours: 1,
    reason: "",
  });

  async function run<T extends { ok: boolean }>(
    call: () => Promise<T>,
    done: string,
    after?: () => void,
  ) {
    setPending(true);
    setError(null);
    try {
      const r = (await call()) as unknown as { ok: true } | ({ ok: false } & Failure);
      if (r.ok) {
        toast.success(done);
        after?.();
        router.refresh();
      } else setError(explain(r));
    } finally {
      setPending(false);
    }
  }

  const approved = state === "APPROVED" || state === "CHANGED";
  const adjustable = canAdjust && !approved && assignments.length > 0;
  if (!canApprove && !adjustable) return null;

  return (
    <div className="flex flex-col gap-4 print:hidden" data-testid="hours-actions">
      {canApprove && (
        <div className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4">
          {state !== "APPROVED" && (
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveMonthAction({ staffId, month }), t("approved"))}
            >
              {state === "CHANGED" ? t("actions.reapprove") : t("actions.approve")}
            </Button>
          )}
          {approved && (
            <>
              <div className="flex min-w-60 flex-1 flex-col gap-1">
                <Label htmlFor="reopen-reason" className="text-[12px]">
                  {t("form.reason")}
                </Label>
                <Input
                  id="reopen-reason"
                  value={reopenReason}
                  maxLength={300}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(
                    () => reopenMonthAction({ staffId, month, reason: reopenReason }),
                    t("reopened"),
                    () => setReopenReason(""),
                  )
                }
              >
                {t("actions.reopen")}
              </Button>
            </>
          )}
        </div>
      )}

      {adjustable && (
        <form
          className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                addAdjustmentAction({
                  staffId,
                  month,
                  assignmentId: adj.assignmentId,
                  hours: adj.hours,
                  reason: adj.reason,
                }),
              t("adjusted"),
              () => setAdj({ ...adj, hours: 1, reason: "" }),
            );
          }}
        >
          <h3 className="w-full text-lg font-semibold">{t("adjustForm.title")}</h3>
          <div className="flex min-w-60 flex-1 flex-col gap-1">
            <Label htmlFor="adj-assignment" className="text-[12px]">
              {t("form.assignment")}
            </Label>
            <Select
              id="adj-assignment"
              value={adj.assignmentId}
              onChange={(e) => setAdj({ ...adj, assignmentId: e.target.value })}
            >
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-24 flex-col gap-1">
            <Label htmlFor="adj-hours" className="text-[12px]">
              {t("form.hours")}
            </Label>
            <Input
              id="adj-hours"
              type="number"
              min={-100}
              max={100}
              value={adj.hours}
              onChange={(e) => setAdj({ ...adj, hours: Number(e.target.value) })}
            />
          </div>
          <div className="flex min-w-60 flex-1 flex-col gap-1">
            <Label htmlFor="adj-reason" className="text-[12px]">
              {t("form.reason")}
            </Label>
            <Input
              id="adj-reason"
              value={adj.reason}
              maxLength={300}
              onChange={(e) => setAdj({ ...adj, reason: e.target.value })}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {t("adjustForm.submit")}
          </Button>
          <p className="text-muted-foreground w-full text-[13px]">{t("adjustForm.hint")}</p>
        </form>
      )}
      {error && (
        <p role="alert" className="rounded-control border-danger text-danger border p-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
