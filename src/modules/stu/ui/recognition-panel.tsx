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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { recordRecognitionAction, voidRecognitionAction } from "../server/recognition.actions";

type Course = {
  id: string;
  code: string;
  name: string;
  credits: number;
  note: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
};

function useExplain() {
  const t = useTranslations("stu.requests");
  return (r: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    const code = r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : r.error.message;
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };
}

function VoidDialog({ course }: { course: Course }) {
  const t = useTranslations("stu.requests");
  const tc = useTranslations("common");
  const router = useRouter();
  const explain = useExplain();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const r = await voidRecognitionAction({ id: course.id, reason } as never);
      if (r.ok) {
        toast.success(t("voided"));
        setOpen(false);
        setReason("");
        router.refresh();
      } else setError(explain(r));
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {t("void")}
          <span className="sr-only"> {course.code}</span>
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">{t("voidTitle")}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {t("voidBody", { course: course.code })}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor={`vr-${course.id}`}>{t("voidReason")}</Label>
          <Textarea
            id={`vr-${course.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={!!error}
          />
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {tc("cancel")}
            </Button>
          </DialogClose>
          <Button type="button" disabled={pending || !reason.trim()} onClick={submit}>
            {t("void")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** AC-5, AC-6, AC-8: the recognized courses of one request, with the form to add one. */
export function RecognitionPanelView({
  submissionId,
  courses,
  canWrite,
  closed,
  ready,
}: {
  submissionId: string;
  courses: Course[];
  canWrite: boolean;
  closed: boolean;
  /** the student and enrollment were identified, so courses can be added */
  ready: boolean;
}) {
  const t = useTranslations("stu.requests");
  const router = useRouter();
  const explain = useExplain();
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editable = canWrite && !closed && ready;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await recordRecognitionAction({
        submissionId,
        courseCode: code,
        credits: credits || null,
        note: note || null,
      } as never);
      if (r.ok) {
        toast.success(t("recorded"));
        setCode("");
        setCredits("");
        setNote("");
        router.refresh();
      } else setError(explain(r));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {courses.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl text-sm">
            <caption className="sr-only">{t("courses")}</caption>
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="py-2 pr-4">
                  {t("columns.code")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("columns.name")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("columns.credits")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("columns.note")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("columns.status")}
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">{t("columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-border border-b align-top">
                  <td className="font-tabular py-2 pr-4">{c.code}</td>
                  <td className="py-2 pr-4">{c.name}</td>
                  <td className="font-tabular py-2 pr-4">{c.credits}</td>
                  <td className="py-2 pr-4">{c.note ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {c.voidedAt ? (
                      <span>
                        {t("statusVoid")}
                        {c.voidReason ? ` · ${c.voidReason}` : ""}
                      </span>
                    ) : (
                      t("statusLive")
                    )}
                  </td>
                  <td className="py-2">{editable && !c.voidedAt && <VoidDialog course={c} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && (
        <form onSubmit={add} className="flex max-w-3xl flex-wrap items-end gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-code">{t("form.courseCode")}</Label>
            <Input
              id="rc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              aria-invalid={!!error}
              aria-describedby={error ? "rc-error" : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-credits">{t("form.credits")}</Label>
            <Input
              id="rc-credits"
              type="number"
              min={1}
              max={60}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              className="w-28"
            />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="rc-note">{t("form.note")}</Label>
            <Input id="rc-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={pending || !code.trim()}>
            {t("form.add")}
          </Button>
          {error && (
            <p id="rc-error" role="alert" className="text-destructive w-full text-sm">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
