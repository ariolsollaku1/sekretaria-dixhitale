"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatTime, parseTime } from "../domain/timetable-rules";
import {
  createSittingAction,
  removeSittingAction,
  updateSittingAction,
} from "../server/exam.actions";
import { useExplainExam } from "./exam-explain";

type CourseOption = { id: string; label: string };
type StaffOption = { id: string; label: string };
type Sitting = {
  id: string;
  planCourseId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  room: string | null;
  note: string | null;
  examinerIds: string[];
  label: string;
};

type State = { date: string; start: string; end: string; room: string; examinerIds: string[] };

const body = (s: State) => ({
  date: s.date,
  startMinute: parseTime(s.start) ?? -1,
  endMinute: parseTime(s.end) ?? -1,
  room: s.room.trim() || null,
  examinerIds: s.examinerIds,
});

function Fields({
  prefix,
  state,
  set,
  staff,
}: {
  prefix: string;
  state: State;
  set: (patch: Partial<State>) => void;
  staff: StaffOption[];
}) {
  const t = useTranslations("cal.exams");
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${prefix}-dt`} className="text-[12px]">
          {t("form.date")}
        </Label>
        <Input
          id={`${prefix}-dt`}
          type="date"
          value={state.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      </div>
      <div className="flex w-28 flex-col gap-1">
        <Label htmlFor={`${prefix}-st`} className="text-[12px]">
          {t("form.start")}
        </Label>
        <Input
          id={`${prefix}-st`}
          type="time"
          value={state.start}
          onChange={(e) => set({ start: e.target.value })}
        />
      </div>
      <div className="flex w-28 flex-col gap-1">
        <Label htmlFor={`${prefix}-en`} className="text-[12px]">
          {t("form.end")}
        </Label>
        <Input
          id={`${prefix}-en`}
          type="time"
          value={state.end}
          onChange={(e) => set({ end: e.target.value })}
        />
      </div>
      <div className="flex w-28 flex-col gap-1">
        <Label htmlFor={`${prefix}-rm`} className="text-[12px]">
          {t("form.room")}
        </Label>
        <Input
          id={`${prefix}-rm`}
          value={state.room}
          onChange={(e) => set({ room: e.target.value })}
        />
      </div>
      <div className="flex min-w-48 flex-col gap-1">
        <Label htmlFor={`${prefix}-ex`} className="text-[12px]">
          {t("form.examiners")}
        </Label>
        <Select
          id={`${prefix}-ex`}
          multiple
          size={3}
          className={cn("min-h-0")}
          value={state.examinerIds}
          onChange={(e) =>
            set({ examinerIds: Array.from(e.target.selectedOptions, (o) => o.value) })
          }
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}

function SittingRow({ sitting, staff }: { sitting: Sitting; staff: StaffOption[] }) {
  const t = useTranslations("cal.exams");
  const router = useRouter();
  const explain = useExplainExam();
  const init: State = {
    date: sitting.date,
    start: formatTime(sitting.startMinute),
    end: formatTime(sitting.endMinute),
    room: sitting.room ?? "",
    examinerIds: [...sitting.examinerIds].sort(),
  };
  const [s, setS] = useState(init);
  const dirty =
    JSON.stringify({ ...s, examinerIds: [...s.examinerIds].sort() }) !== JSON.stringify(init);
  return (
    <li className="rounded-control border-border bg-card flex flex-wrap items-end gap-2 border p-3">
      <span className="min-w-28 text-sm font-semibold">{sitting.label.split(" ")[0]}</span>
      <Fields prefix={sitting.id} state={s} set={(p) => setS({ ...s, ...p })} staff={staff} />
      <Button
        type="button"
        disabled={!dirty}
        onClick={async () => {
          const r = await updateSittingAction({
            sittingId: sitting.id,
            note: sitting.note,
            ...body(s),
          });
          if (r.ok) {
            toast.success(t("saved"));
            router.refresh();
          } else toast.error(explain(r));
        }}
      >
        {t("save")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={async () => {
          const r = await removeSittingAction({ sittingId: sitting.id });
          if (r.ok) router.refresh();
          else toast.error(explain(r));
        }}
      >
        {t("remove")} <span className="sr-only">{sitting.label}</span>
      </Button>
    </li>
  );
}

/** AC-2..AC-6: add, change and remove the exams of a session. Clashes come back as a readable message. */
export function ExamSittingEditor({
  sessionId,
  courses,
  staff,
  sittings,
  defaultDate,
}: {
  sessionId: string;
  courses: CourseOption[];
  staff: StaffOption[];
  sittings: Sitting[];
  defaultDate: string;
}) {
  const t = useTranslations("cal.exams");
  const router = useRouter();
  const explain = useExplainExam();
  const open = courses.filter((c) => !sittings.some((s) => s.planCourseId === c.id));
  const [planCourseId, setPlanCourseId] = useState(open[0]?.id ?? "");
  const [s, setS] = useState<State>({
    date: defaultDate,
    start: "09:00",
    end: "11:00",
    room: "",
    examinerIds: [],
  });
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-col gap-6 print:hidden">
      {open.length === 0 ? (
        <p className="rounded-control border-border bg-muted border p-3 text-sm">
          {t("noCourses")}
        </p>
      ) : (
        <form
          className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              const r = await createSittingAction({
                sessionId,
                planCourseId,
                note: null,
                ...body(s),
              });
              if (r.ok) {
                toast.success(t("added"));
                router.refresh();
              } else toast.error(explain(r));
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="flex min-w-60 flex-1 flex-col gap-1">
            <Label htmlFor="new-course" className="text-[12px]">
              {t("form.course")}
            </Label>
            <Select
              id="new-course"
              value={planCourseId}
              onChange={(e) => setPlanCourseId(e.target.value)}
            >
              {open.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <Fields prefix="new" state={s} set={(p) => setS({ ...s, ...p })} staff={staff} />
          <Button type="submit" disabled={pending}>
            {t("add")}
          </Button>
        </form>
      )}
      {sittings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sittings.map((x) => (
            <SittingRow
              key={`${x.id}-${x.date}-${x.startMinute}-${x.endMinute}-${x.room}-${x.examinerIds.join()}`}
              sitting={x}
              staff={staff}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
