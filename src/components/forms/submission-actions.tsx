"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { assignAction, changeStateAction, commentAction } from "@/lib/forms/submission.actions";

/** AC-8: the inbox actions of one submission. */
export function SubmissionActions({
  submissionId,
  next,
  assignees,
  assigneeId,
}: {
  submissionId: string;
  next: { key: string; label: string }[];
  assignees: { id: string; name: string }[];
  assigneeId: string | null;
}) {
  const t = useTranslations("forms.inbox");
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState(assigneeId ?? "");
  const [busy, setBusy] = useState(false);

  const explain = (r: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    const code = r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : r.error.message;
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };
  async function change(to: string) {
    setBusy(true);
    try {
      const r = await changeStateAction({ submissionId, to, comment: comment || null });
      if (r.ok) {
        setComment("");
        toast.success(t("stateChanged"));
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setBusy(false);
    }
  }
  async function addComment() {
    setBusy(true);
    try {
      const r = await commentAction({ submissionId, comment });
      if (r.ok) {
        setComment("");
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setBusy(false);
    }
  }
  async function assign() {
    setBusy(true);
    try {
      const r = await assignAction({ submissionId, assigneeId: assignee || null });
      if (r.ok) {
        toast.success(t("assigned"));
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4 print:hidden">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assignee">{t("assignee")}</Label>
          <Select id="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t("nobody")}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || assignee === (assigneeId ?? "")}
          onClick={assign}
        >
          {t("assign")}
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inbox-comment">{t("comment")}</Label>
        <Textarea id="inbox-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !comment.trim()}
          onClick={addComment}
        >
          {t("addComment")}
        </Button>
        {next.map((n) => (
          <Button key={n.key} type="button" disabled={busy} onClick={() => change(n.key)}>
            {t("moveTo", { state: n.label })}
          </Button>
        ))}
      </div>
    </div>
  );
}
