"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { SESSION_TYPES } from "../domain/exam-rules";
import {
  createSessionAction,
  publishSessionAction,
  updateSessionAction,
} from "../server/exam.actions";
import { useExplainExam } from "./exam-explain";

/** AC-1: define a session of the selected academic year; kinds already present are not offered. */
export function ExamSessionCreate({
  academicYearId,
  existing,
}: {
  academicYearId: string;
  existing: readonly string[];
}) {
  const t = useTranslations("cal.exams");
  const router = useRouter();
  const explain = useExplainExam();
  const free = SESSION_TYPES.filter((x) => !existing.includes(x));
  const [type, setType] = useState<string>(free[0] ?? "");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [pending, setPending] = useState(false);
  if (free.length === 0) return null;
  return (
    <form
      className="rounded-card border-border bg-muted/40 mb-6 flex flex-wrap items-end gap-3 border p-4 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        try {
          const r = await createSessionAction({
            academicYearId,
            type: type as never,
            startDate,
            endDate,
          });
          if (r.ok) {
            toast.success(t("sessionAdded"));
            router.push(`/cal/exams/${r.data.sessionId}`);
          } else toast.error(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex min-w-48 flex-col gap-1">
        <Label htmlFor="ses-type" className="text-[12px]">
          {t("form.type")}
        </Label>
        <Select id="ses-type" value={type} onChange={(e) => setType(e.target.value)}>
          {free.map((x) => (
            <option key={x} value={x}>
              {t(`type.${x}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ses-start" className="text-[12px]">
          {t("form.startDate")}
        </Label>
        <Input
          id="ses-start"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ses-end" className="text-[12px]">
          {t("form.endDate")}
        </Label>
        <Input
          id="ses-end"
          type="date"
          required
          value={endDate}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {t("addSession")}
      </Button>
    </form>
  );
}

/** AC-6, AC-7: change a session's dates and publish or withdraw its schedule. */
export function ExamSessionPanel({
  sessionId,
  startDate,
  endDate,
  published,
}: {
  sessionId: string;
  startDate: string;
  endDate: string;
  published: boolean;
}) {
  const t = useTranslations("cal.exams");
  const router = useRouter();
  const explain = useExplainExam();
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const dirty = start !== startDate || end !== endDate;
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
      <div className="flex flex-col gap-1">
        <Label htmlFor="sd-start" className="text-[12px]">
          {t("form.startDate")}
        </Label>
        <Input id="sd-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="sd-end" className="text-[12px]">
          {t("form.endDate")}
        </Label>
        <Input id="sd-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={!dirty}
        onClick={async () => {
          const r = await updateSessionAction({ sessionId, startDate: start, endDate: end });
          if (r.ok) {
            toast.success(t("saved"));
            router.refresh();
          } else toast.error(explain(r));
        }}
      >
        {t("saveDates")}
      </Button>
      <Button
        type="button"
        variant={published ? "secondary" : "primary"}
        onClick={async () => {
          const r = await publishSessionAction({ sessionId, published: !published });
          if (r.ok) {
            toast.success(t(published ? "unpublished" : "publishedDone"));
            router.refresh();
          } else toast.error(explain(r));
        }}
      >
        {published ? t("unpublish") : t("publish")}
      </Button>
    </div>
  );
}
