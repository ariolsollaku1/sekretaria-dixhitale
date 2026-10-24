"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { allowedTransitions, type LeadStatus } from "../domain/lead-rules";
import {
  addLeadNoteAction,
  assignLeadAction,
  changeLeadStatusAction,
  inviteLeadAction,
} from "../server/lead.actions";
import { useExplain } from "./explain";

/** AC-6..AC-8: status change, assignment, invitation and notes of one lead. */
export function LeadActions({
  leadId,
  status,
  assigneeId,
  assignees,
  canInvite,
}: {
  leadId: string;
  status: LeadStatus;
  assigneeId: string | null;
  assignees: { id: string; name: string }[];
  canInvite: boolean;
}) {
  const t = useTranslations("adm.leadActions");
  const ts = useTranslations("adm.leadStatus");
  const router = useRouter();
  const explain = useExplain();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next = allowedTransitions(status);

  async function run(fn: () => Promise<{ ok: boolean }>, done: string, after?: () => void) {
    setPending(true);
    setError(null);
    try {
      const r = (await fn()) as Awaited<ReturnType<typeof inviteLeadAction>>;
      if (r.ok) {
        toast.success(done);
        after?.();
        router.refresh();
      } else setError(explain(r));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 print:hidden">
      <section aria-labelledby="lead-status-h" className="flex flex-col gap-3">
        <h2 id="lead-status-h" className="text-lg font-semibold">
          {t("status")}
        </h2>
        {next.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("final")}</p>
        ) : (
          <>
            {next.includes("LOST") && (
              <div className="flex max-w-md flex-col gap-1.5">
                <Label htmlFor="lead-lost-reason">{t("lostReason")}</Label>
                <Input
                  id="lead-lost-reason"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {next.map((to) => (
                <Button
                  key={to}
                  type="button"
                  variant={to === "LOST" ? "destructive" : "secondary"}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => changeLeadStatusAction({ leadId, to, reason }),
                      t("statusChanged"),
                      () => setReason(""),
                    )
                  }
                >
                  {t("moveTo", { status: ts(to) })}
                </Button>
              ))}
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="lead-assign-h" className="flex flex-col gap-3">
        <h2 id="lead-assign-h" className="text-lg font-semibold">
          {t("assign")}
        </h2>
        <div className="flex max-w-md flex-col gap-1.5">
          <Label htmlFor="lead-assignee">{t("assignee")}</Label>
          <Select
            id="lead-assignee"
            value={assigneeId ?? ""}
            disabled={pending}
            onChange={(e) =>
              run(
                () => assignLeadAction({ leadId, assigneeId: e.target.value || null }),
                t("assigned"),
              )
            }
          >
            <option value="">{t("unassigned")}</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
      </section>

      {canInvite && (
        <section aria-labelledby="lead-invite-h" className="flex flex-col gap-3">
          <h2 id="lead-invite-h" className="text-lg font-semibold">
            {t("invite")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("inviteHint")}</p>
          <div>
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => inviteLeadAction({ leadId }), t("invited"))}
            >
              {t("sendInvitation")}
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="lead-note-h" className="flex flex-col gap-3">
        <h2 id="lead-note-h" className="text-lg font-semibold">
          {t("notes")}
        </h2>
        <div className="flex max-w-xl flex-col gap-1.5">
          <Label htmlFor="lead-note">{t("note")}</Label>
          <Textarea
            id="lead-note"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !note.trim()}
            onClick={() =>
              run(
                () => addLeadNoteAction({ leadId, body: note }),
                t("noteAdded"),
                () => setNote(""),
              )
            }
          >
            {t("addNote")}
          </Button>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
