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
import { toast } from "@/components/ui/toaster";
import { cancelDocumentAction, issueTestDocumentAction } from "@/lib/documents/actions";

/** AC-10: issue a sample document to try the published templates. */
export function TestDocumentButtons() {
  const t = useTranslations("documents.admin");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function issue(language: "sq" | "en") {
    setBusy(true);
    try {
      const r = await issueTestDocumentAction({ language });
      if (r.ok) {
        toast.success(t("testIssued", { number: r.data.number }));
        router.refresh();
      } else
        toast.error(
          r.error.message === "NO_TEMPLATE"
            ? t("noTemplate")
            : r.error.code === "UNAVAILABLE"
              ? t("unavailable")
              : r.error.message,
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => issue("sq")}>
        {t("testSq")}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => issue("en")}>
        {t("testEn")}
      </Button>
    </div>
  );
}

/** AC-9: cancel with a reason. */
export function CancelDocumentButton({
  documentId,
  number,
}: {
  documentId: string;
  number: string;
}) {
  const t = useTranslations("documents.admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      const r = await cancelDocumentAction({ documentId, reason } as never);
      if (r.ok) {
        toast.success(t("cancelled"));
        setOpen(false);
        router.refresh();
      } else toast.error(r.error.fieldErrors?.reason ? t("reasonRequired") : r.error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t("cancel")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">{t("cancelTitle", { number })}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {t("cancelBody")}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor={`reason-${documentId}`}>{t("reason")}</Label>
          <Input
            id={`reason-${documentId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{tc("cancel")}</Button>
          </DialogClose>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={cancel}>
            {t("cancelConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
