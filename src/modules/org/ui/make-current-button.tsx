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
import { makeCurrentAction } from "../server/year.actions";

/** AC-5: a deliberate, audited switch that also closes the previous current year. */
export function MakeCurrentButton({
  yearId,
  code,
  previousCode,
}: {
  yearId: string;
  code: string;
  previousCode: string | null;
}) {
  const t = useTranslations("org");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await makeCurrentAction({ yearId, reason } as never);
      if (result.ok) {
        toast.success(t("actions.madeCurrent", { code }));
        setOpen(false);
        router.refresh();
      } else if (result.error.fieldErrors?.reason) {
        setError(t("errors.reasonRequired"));
      } else {
        toast.error(
          t.has(`errors.${result.error.message}` as never)
            ? t(`errors.${result.error.message}` as never)
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
        <Button type="button">{t("actions.makeCurrent")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">
          {t("actions.makeCurrentTitle", { code })}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {previousCode
            ? t("actions.makeCurrentBodyClosing", { code, previous: previousCode })
            : t("actions.makeCurrentBody", { code })}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="year-reason">{t("actions.reason")}</Label>
          <p className="text-muted-foreground text-[13px]">{t("actions.reasonHint")}</p>
          <Textarea
            id="year-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "year-reason-error" : undefined}
          />
          {error && (
            <p
              id="year-reason-error"
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
          <Button disabled={pending} onClick={submit}>
            {t("actions.makeCurrent")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
