"use client";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
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

/** A dialog that asks for a reason (audited actions) and optionally extra fields (children). */
export function ReasonDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  destructive,
  children,
  onSubmit,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  children?: ReactNode;
  /** Return null on success, or the message to show. */
  onSubmit: (reason: string) => Promise<string | null>;
}) {
  const t = useTranslations("org");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      const message = await onSubmit(reason);
      if (message) setError(message);
      else {
        setOpen(false);
        setReason("");
        setError(null);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={destructive ? "destructive" : "secondary"}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {description}
        </DialogDescription>
        {children}
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="reason-field">{t("actions.reason")}</Label>
          <Textarea
            id="reason-field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "reason-error" : undefined}
          />
          {error && (
            <p id="reason-error" role="alert" className="text-danger text-[13px] font-semibold">
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
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
