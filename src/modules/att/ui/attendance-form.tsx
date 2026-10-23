"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  cancelSessionAction,
  cancelSessionCorrectAction,
  saveAttendanceAction,
  saveAttendanceCorrectAction,
} from "../server/session.actions";
import { useExplain } from "./explain";

type Status = "PRESENT" | "ABSENT" | "EXCUSED";
const STATUSES: Status[] = ["PRESENT", "ABSENT", "EXCUSED"];

type Student = {
  studentId: string;
  studentNumber: string;
  name: string;
  status: Status | null;
  note: string | null;
};

/**
 * AC-4/AC-5/AC-12: the roster of a session, one big choice per student (default present), "all
 * present" shortcut, hours and topic; the Secretariat also gives the reason (AC-7). `edit` null
 * shows the saved marks read-only.
 */
export function AttendanceForm({
  sessionId,
  status,
  hours: initialHours,
  topic: initialTopic,
  roster,
  edit,
}: {
  sessionId: string;
  status: "PLANNED" | "HELD" | "CANCELLED";
  hours: number;
  topic: string | null;
  roster: Student[];
  edit: "record" | "correct" | null;
}) {
  const t = useTranslations("att");
  const router = useRouter();
  const explain = useExplain();
  const save = edit === "correct" ? saveAttendanceCorrectAction : saveAttendanceAction;
  const cancel = edit === "correct" ? cancelSessionCorrectAction : cancelSessionAction;
  const [marks, setMarks] = useState<Record<string, { status: Status; note: string }>>(
    Object.fromEntries(
      roster.map((s) => [s.studentId, { status: s.status ?? "PRESENT", note: s.note ?? "" }]),
    ),
  );
  const [hours, setHours] = useState(initialHours);
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (edit === null)
    return roster.length === 0 ? (
      <p className="text-muted-foreground text-sm">{t("noRoster")}</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {roster.map((s) => (
          <li
            key={s.studentId}
            className="rounded-card border-border bg-card flex flex-wrap justify-between gap-2 border p-3 text-sm"
          >
            <span>
              <span className="font-tabular text-muted-foreground">{s.studentNumber}</span> {s.name}
              {s.note && <span className="text-muted-foreground italic"> · {s.note}</span>}
            </span>
            <span className="font-semibold">
              {s.status ? t(`mark.${s.status}`) : t("notMarked")}
            </span>
          </li>
        ))}
      </ul>
    );

  const needsReason = edit === "correct";
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await save({
            sessionId,
            hours,
            topic: topic || null,
            reason: reason || null,
            marks: roster.map((s) => ({
              studentId: s.studentId,
              status: marks[s.studentId]!.status,
              note:
                marks[s.studentId]!.status === "PRESENT" ? null : marks[s.studentId]!.note || null,
            })),
          });
          if (r.ok) {
            toast.success(t("saved"));
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-24 flex-col gap-1">
          <Label htmlFor="att-hours" className="text-[12px]">
            {t("form.hours")}
          </Label>
          <Input
            id="att-hours"
            type="number"
            min={1}
            max={12}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor="att-topic" className="text-[12px]">
            {t("form.topic")}
          </Label>
          <Input
            id="att-topic"
            value={topic}
            maxLength={300}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setMarks(
              Object.fromEntries(
                roster.map((s) => [s.studentId, { status: "PRESENT" as Status, note: "" }]),
              ),
            )
          }
        >
          {t("allPresent")}
        </Button>
      </div>

      {roster.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noRoster")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {roster.map((s) => {
            const m = marks[s.studentId]!;
            return (
              <li key={s.studentId} className="rounded-card border-border bg-card border p-3">
                <fieldset>
                  <legend className="mb-2 text-sm">
                    <span className="font-tabular text-muted-foreground">{s.studentNumber}</span>{" "}
                    <span className="font-semibold">{s.name}</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map((st) => (
                      <label
                        key={st}
                        className="rounded-control border-input has-[:checked]:border-primary has-[:checked]:bg-accent flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 border px-3 text-sm font-semibold has-[:focus-visible]:ring-2"
                      >
                        <input
                          type="radio"
                          name={`mark-${s.studentId}`}
                          value={st}
                          checked={m.status === st}
                          onChange={() =>
                            setMarks({ ...marks, [s.studentId]: { ...m, status: st } })
                          }
                        />
                        {t(`mark.${st}`)}
                      </label>
                    ))}
                  </div>
                  {m.status !== "PRESENT" && (
                    <div className="mt-2 flex flex-col gap-1">
                      <Label htmlFor={`note-${s.studentId}`} className="text-[12px]">
                        {t("form.note")}
                      </Label>
                      <Input
                        id={`note-${s.studentId}`}
                        value={m.note}
                        maxLength={200}
                        onChange={(e) =>
                          setMarks({ ...marks, [s.studentId]: { ...m, note: e.target.value } })
                        }
                      />
                    </div>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}

      {needsReason && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="att-reason">{t("form.reason")}</Label>
          <Textarea
            id="att-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-muted-foreground text-[13px]">{t("form.reasonHint")}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-control border-danger text-danger border p-3 text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {t("saveHeld")}
        </Button>
        {(status === "PLANNED" || edit === "correct") && (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                const r = await cancel({ sessionId, reason: reason || null });
                if (r.ok) {
                  toast.success(t("cancelled"));
                  router.refresh();
                } else setError(explain(r));
              } finally {
                setPending(false);
              }
            }}
          >
            {t("cancelClass")}
          </Button>
        )}
      </div>
    </form>
  );
}
