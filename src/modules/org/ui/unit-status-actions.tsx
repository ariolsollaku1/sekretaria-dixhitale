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
  deactivateDepartmentAction,
  deactivateFacultyAction,
  reactivateDepartmentAction,
  reactivateFacultyAction,
} from "../server/unit.actions";

/** AC-5: deactivate / reactivate a faculty or department with a mandatory reason. */
export function UnitStatusActions({
  kind,
  id,
  active,
}: {
  kind: "faculty" | "department";
  id: string;
  active: boolean;
}) {
  const t = useTranslations("org");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const act =
    kind === "faculty"
      ? active
        ? deactivateFacultyAction
        : reactivateFacultyAction
      : active
        ? deactivateDepartmentAction
        : reactivateDepartmentAction;
  const key = active ? "deactivate" : "reactivate";

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await act({ id, reason } as never);
      if (result.ok) {
        toast.success(t("actions.statusChanged"));
        setOpen(false);
        setReason("");
        router.refresh();
      } else if (result.error.fieldErrors?.reason) {
        setError(t("errors.reasonRequired"));
      } else {
        const [code, count] = result.error.message.split(":");
        const known = code && t.has(`errors.${code}` as never);
        toast.error(
          known
            ? t(`errors.${code}` as never, { count: Number(count ?? 0) } as never)
            : t("errors.generic"),
        );
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={active ? "destructive" : "secondary"}>
          {t(`unit.${key}`)}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">{t(`unit.${key}Title`)}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {t(`unit.${key}Body`)}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="unit-reason">{t("actions.reason")}</Label>
          <p className="text-muted-foreground text-[13px]">{t("actions.reasonHint")}</p>
          <Textarea
            id="unit-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "unit-reason-error" : undefined}
          />
          {error && (
            <p
              id="unit-reason-error"
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
            {t(`unit.${key}`)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
