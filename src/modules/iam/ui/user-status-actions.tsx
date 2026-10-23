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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  deactivateUserAction,
  reactivateUserAction,
  resendActivationAction,
} from "../server/user.actions";
import { errorMessage } from "./messages";

/** AC-6: deactivate / reactivate need a reason; AC-10: resend activation. */
export function UserStatusActions({
  userId,
  active,
  canResend,
  isSelf,
}: {
  userId: string;
  active: boolean;
  canResend: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations("iam");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setReasonError(null);
    try {
      const result = await (active ? deactivateUserAction : reactivateUserAction)({
        userId,
        reason,
      } as never);
      if (result.ok) {
        toast.success(t("actions.statusChanged"));
        setOpen(false);
        setReason("");
        router.refresh();
        return;
      }
      const reasonKey = result.error.fieldErrors?.reason?.[0];
      if (reasonKey) setReasonError(errorMessage(t, "required"));
      else
        toast.error(
          errorMessage(
            t,
            result.error.code === "CONFLICT" ? result.error.message : result.error.code,
          ),
        );
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    const result = await resendActivationAction({ userId });
    if (result.ok) toast.success(t("actions.resent"));
    else
      toast.error(
        errorMessage(
          t,
          result.error.code === "CONFLICT" ? result.error.message : result.error.code,
        ),
      );
  }

  const key = active ? "deactivate" : "reactivate";
  return (
    <div className="flex flex-wrap gap-2">
      {canResend && (
        <Button type="button" variant="secondary" onClick={resend}>
          {t("actions.resend")}
        </Button>
      )}
      {!(active && isSelf) && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant={active ? "destructive" : "secondary"}>
              {t(`actions.${key}`)}
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={tc("close")}>
            <DialogTitle className="text-lg font-semibold">{t(`actions.${key}Title`)}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-2 text-sm">
              {t(`actions.${key}Body`)}
            </DialogDescription>
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="status-reason">{t("actions.reason")}</Label>
              <p className="text-muted-foreground text-[13px]">{t("actions.reasonHint")}</p>
              <Textarea
                id="status-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={!!reasonError}
                aria-describedby={reasonError ? "status-reason-error" : undefined}
              />
              {reasonError && (
                <p
                  id="status-reason-error"
                  role="alert"
                  className="text-danger text-[13px] font-semibold"
                >
                  {reasonError}
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">{tc("cancel")}</Button>
              </DialogClose>
              <Button
                variant={active ? "destructive" : "primary"}
                disabled={pending}
                onClick={submit}
              >
                {t(`actions.${key}`)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
