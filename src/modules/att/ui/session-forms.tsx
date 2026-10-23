"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { defaultHours, parseTime } from "../domain/session-rules";
import {
  addSessionAction,
  addSessionCorrectAction,
  generateSessionsAction,
  generateSessionsCorrectAction,
} from "../server/session.actions";
import { useExplain } from "./explain";

type Assignment = { id: string; label: string };

/** AC-2/AC-3: generate the sessions of an assignment from its timetable, or add an extra class. */
export function SessionForms({
  mode,
  assignments,
  defaultFrom,
  defaultTo,
  today,
}: {
  mode: "record" | "correct";
  assignments: Assignment[];
  defaultFrom: string;
  defaultTo: string;
  today: string;
}) {
  const t = useTranslations("att");
  const router = useRouter();
  const explain = useExplain();
  const generate = mode === "correct" ? generateSessionsCorrectAction : generateSessionsAction;
  const add = mode === "correct" ? addSessionCorrectAction : addSessionAction;
  const [g, setG] = useState({
    assignmentId: assignments[0]?.id ?? "",
    from: defaultFrom,
    to: defaultTo,
  });
  const [x, setX] = useState({
    assignmentId: assignments[0]?.id ?? "",
    date: today,
    start: "08:00",
    end: "09:30",
    hours: 2,
    topic: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (assignments.length === 0)
    return (
      <p className="rounded-control border-border bg-muted border p-3 text-sm">
        {t("noAssignments")}
      </p>
    );

  const picker = (id: string, value: string, set: (v: string) => void) => (
    <div className="flex min-w-60 flex-1 flex-col gap-1">
      <Label htmlFor={id} className="text-[12px]">
        {t("form.assignment")}
      </Label>
      <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
        {assignments.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 print:hidden">
      <form
        className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            const r = await generate(g);
            if (r.ok) {
              toast.success(t("generated", r.data));
              router.refresh();
            } else setError(explain(r));
          } finally {
            setPending(false);
          }
        }}
      >
        <h3 className="w-full text-lg font-semibold">{t("generate.title")}</h3>
        {picker("gen-assignment", g.assignmentId, (v) => setG({ ...g, assignmentId: v }))}
        <div className="flex flex-col gap-1">
          <Label htmlFor="gen-from" className="text-[12px]">
            {t("form.from")}
          </Label>
          <Input
            id="gen-from"
            type="date"
            value={g.from}
            onChange={(e) => setG({ ...g, from: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="gen-to" className="text-[12px]">
            {t("form.to")}
          </Label>
          <Input
            id="gen-to"
            type="date"
            value={g.to}
            onChange={(e) => setG({ ...g, to: e.target.value })}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("generate.submit")}
        </Button>
        <p className="text-muted-foreground w-full text-[13px]">{t("generate.hint")}</p>
      </form>

      <form
        className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            const r = await add({
              assignmentId: x.assignmentId,
              date: x.date,
              startMinute: parseTime(x.start) ?? -1,
              endMinute: parseTime(x.end) ?? -1,
              hours: x.hours,
              topic: x.topic || null,
            });
            if (r.ok) {
              toast.success(t("added"));
              router.refresh();
            } else setError(explain(r));
          } finally {
            setPending(false);
          }
        }}
      >
        <h3 className="w-full text-lg font-semibold">{t("extra.title")}</h3>
        {picker("ex-assignment", x.assignmentId, (v) => setX({ ...x, assignmentId: v }))}
        <div className="flex flex-col gap-1">
          <Label htmlFor="ex-date" className="text-[12px]">
            {t("form.date")}
          </Label>
          <Input
            id="ex-date"
            type="date"
            value={x.date}
            onChange={(e) => setX({ ...x, date: e.target.value })}
          />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <Label htmlFor="ex-start" className="text-[12px]">
            {t("form.start")}
          </Label>
          <Input
            id="ex-start"
            type="time"
            value={x.start}
            onChange={(e) => {
              const start = e.target.value;
              const a = parseTime(start);
              const b = parseTime(x.end);
              setX({
                ...x,
                start,
                hours: a !== null && b !== null && b > a ? defaultHours(a, b) : x.hours,
              });
            }}
          />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <Label htmlFor="ex-end" className="text-[12px]">
            {t("form.end")}
          </Label>
          <Input
            id="ex-end"
            type="time"
            value={x.end}
            onChange={(e) => {
              const end = e.target.value;
              const a = parseTime(x.start);
              const b = parseTime(end);
              setX({
                ...x,
                end,
                hours: a !== null && b !== null && b > a ? defaultHours(a, b) : x.hours,
              });
            }}
          />
        </div>
        <div className="flex w-24 flex-col gap-1">
          <Label htmlFor="ex-hours" className="text-[12px]">
            {t("form.hours")}
          </Label>
          <Input
            id="ex-hours"
            type="number"
            min={1}
            max={12}
            value={x.hours}
            onChange={(e) => setX({ ...x, hours: Number(e.target.value) })}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor="ex-topic" className="text-[12px]">
            {t("form.topic")}
          </Label>
          <Input
            id="ex-topic"
            value={x.topic}
            maxLength={300}
            onChange={(e) => setX({ ...x, topic: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {t("extra.submit")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="rounded-control border-danger text-danger border p-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
