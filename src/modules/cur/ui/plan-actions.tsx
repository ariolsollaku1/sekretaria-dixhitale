"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { approvePlanAction, archivePlanAction, deletePlanAction } from "../server/plan.actions";

/** AC-7/AC-8: approve a draft, delete a draft, archive an approved plan (with a reason). */
export function PlanActions({
  planId,
  status,
}: {
  planId: string;
  status: "DRAFT" | "APPROVED" | "ARCHIVED";
}) {
  const t = useTranslations("cur.plan");
  const root = useTranslations();
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function explain(message: string) {
    const [code, rest] = message.split(":");
    if (code === "HAS_DEPENDENTS") {
      const names = (rest ?? "")
        .split(",")
        .map((p) => p.split("="))
        .map(([k, n]) => `${root.has(k as never) ? root(k as never) : k} (${n})`);
      return t("errors.HAS_DEPENDENTS", { names: names.join(", ") });
    }
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  }

  async function approve() {
    const r = await approvePlanAction({ planId });
    if (r.ok) {
      toast.success(t("actions.approved"));
      router.refresh();
    } else toast.error(explain(r.error.message));
  }
  async function remove() {
    const r = await deletePlanAction({ planId });
    if (r.ok) {
      toast.success(t("actions.deleted"));
      router.push("/cur/plans");
      router.refresh();
    } else toast.error(explain(r.error.message));
  }
  async function archive() {
    setPending(true);
    setError(null);
    try {
      const r = await archivePlanAction({ planId, reason } as never);
      if (r.ok) {
        toast.success(t("actions.archived"));
        setOpen(false);
        router.refresh();
      } else if (r.error.fieldErrors?.reason) setError(t("errors.reasonRequired"));
      else toast.error(explain(r.error.message));
    } finally {
      setPending(false);
    }
  }

  if (status === "DRAFT")
    return (
      <>
        <ConfirmDialog
          trigger={<Button>{t("actions.approve")}</Button>}
          title={t("actions.approveTitle")}
          description={t("actions.approveBody")}
          confirmLabel={t("actions.approve")}
          onConfirm={approve}
        />
        <ConfirmDialog
          trigger={<Button variant="destructive">{t("actions.delete")}</Button>}
          title={t("actions.deleteTitle")}
          description={t("actions.deleteBody")}
          confirmLabel={t("actions.delete")}
          destructive
          onConfirm={remove}
        />
      </>
    );
  if (status === "APPROVED")
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">{t("actions.archive")}</Button>
        </DialogTrigger>
        <DialogContent closeLabel={tc("close")}>
          <DialogTitle className="text-lg font-semibold">{t("actions.archiveTitle")}</DialogTitle>
          <DialogDescription className="text-muted-foreground mt-2 text-sm">
            {t("actions.archiveBody")}
          </DialogDescription>
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="plan-reason">{t("actions.reason")}</Label>
            <Textarea
              id="plan-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "plan-reason-error" : undefined}
            />
            {error && (
              <p
                id="plan-reason-error"
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
            <Button disabled={pending} onClick={archive}>
              {t("actions.archive")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  return null;
}
