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
import { deactivateCourseAction, reactivateCourseAction } from "../server/course.actions";

/** AC-6: deactivate / reactivate a course with a mandatory reason. */
export function CourseStatusActions({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations("cur");
  const root = useTranslations();
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
      const result = await (active ? deactivateCourseAction : reactivateCourseAction)({
        id,
        reason,
      } as never);
      if (result.ok) {
        toast.success(t("actions.statusChanged"));
        setOpen(false);
        setReason("");
        router.refresh();
      } else if (result.error.fieldErrors?.reason) {
        setError(t("errors.reasonRequired"));
      } else {
        const [code, rest] = result.error.message.split(":");
        if (code === "HAS_DEPENDENTS") {
          const names = (rest ?? "")
            .split(",")
            .map((p) => p.split("="))
            .map(([k, n]) => `${root.has(k as never) ? root(k as never) : k} (${n})`);
          toast.error(t("errors.HAS_DEPENDENTS", { names: names.join(", ") }));
        } else if (result.error.code === "FORBIDDEN") toast.error(t("errors.FORBIDDEN"));
        else
          toast.error(
            code && t.has(`errors.${code}` as never)
              ? t(`errors.${code}` as never)
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
          {t(`actions.${key}`)}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">{t(`actions.${key}Title`)}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {t(`actions.${key}Body`)}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="course-reason">{t("actions.reason")}</Label>
          <p className="text-muted-foreground text-[13px]">{t("actions.reasonHint")}</p>
          <Textarea
            id="course-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "course-reason-error" : undefined}
          />
          {error && (
            <p
              id="course-reason-error"
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
