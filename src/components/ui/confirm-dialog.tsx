"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

/**
 * Deliberate confirm for irreversible actions (design-system.md): say what will happen, name the
 * outcome on the button. `destructive` makes the confirm button red.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={t("close")}>
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {description}
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("cancel")}</Button>
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "primary"}
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
