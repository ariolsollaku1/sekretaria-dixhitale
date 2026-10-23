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
import { deactivateStaffAction, reactivateStaffAction } from "../server/staff.actions";

/** AC-7: end or resume employment; a reason is mandatory. */
export function StaffStatusActions({ staffId, active }: { staffId: string; active: boolean }) {
  const t = useTranslations("hr");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = active ? "deactivate" : "reactivate";

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await (active ? deactivateStaffAction : reactivateStaffAction)({
        staffId,
        reason,
      } as never);
      if (result.ok) {
        toast.success(t("actions.statusChanged"));
        setOpen(false);
        setReason("");
        router.refresh();
      } else if (result.error.fieldErrors?.reason) setError(t("errors.reasonRequired"));
      else toast.error(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
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
          <Label htmlFor="staff-reason">{t("actions.reason")}</Label>
          <Textarea
            id="staff-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "staff-reason-error" : undefined}
          />
          {error && (
            <p
              id="staff-reason-error"
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
          <Button variant={active ? "destructive" : "primary"} disabled={pending} onClick={submit}>
            {t(`actions.${key}`)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
