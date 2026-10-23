"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { formatTime, parseTime, WEEKDAYS } from "../domain/timetable-rules";
import {
  createEntryAction,
  removeEntryAction,
  updateEntryAction,
} from "../server/timetable.actions";

type Assignment = { id: string; label: string };
type Entry = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  room: string | null;
  validFrom: string;
  validTo: string;
  label: string;
};

function useExplain() {
  const t = useTranslations("cal.timetable");
  const root = useTranslations();
  return (r: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    if (r.error.message.startsWith("CLASH:"))
      return t("clash", {
        clashes: r.error.message
          .slice(6)
          .split("; ")
          .map((c) => {
            const [kind, rest] = [c.slice(0, c.indexOf(":")), c.slice(c.indexOf(":") + 1)];
            return `${t(`clashKind.${kind}` as never)}: ${rest}`;
          })
          .join("; "),
      });
    const code = r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : r.error.message;
    void root;
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };
}

function SlotFields({
  prefix,
  state,
  set,
}: {
  prefix: string;
  state: { weekday: number; start: string; end: string; room: string; from: string; to: string };
  set: (
    patch: Partial<{
      weekday: number;
      start: string;
      end: string;
      room: string;
      from: string;
      to: string;
    }>,
  ) => void;
}) {
  const t = useTranslations("cal.timetable");
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${prefix}-wd`} className="text-[12px]">
          {t("form.weekday")}
        </Label>
        <Select
          id={`${prefix}-wd`}
          value={state.weekday}
          onChange={(e) => set({ weekday: Number(e.target.value) })}
        >
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>
              {t(`weekday.${d}`)}
            </option>
          ))}
        </Select>
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
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${prefix}-vf`} className="text-[12px]">
          {t("form.validFrom")}
        </Label>
        <Input
          id={`${prefix}-vf`}
          type="date"
          value={state.from}
          onChange={(e) => set({ from: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${prefix}-vt`} className="text-[12px]">
          {t("form.validTo")}
        </Label>
        <Input
          id={`${prefix}-vt`}
          type="date"
          value={state.to}
          onChange={(e) => set({ to: e.target.value })}
        />
      </div>
    </>
  );
}

const body = (s: {
  weekday: number;
  start: string;
  end: string;
  room: string;
  from: string;
  to: string;
}) => ({
  weekday: s.weekday,
  startMinute: parseTime(s.start) ?? -1,
  endMinute: parseTime(s.end) ?? -1,
  room: s.room || null,
  validFrom: s.from || null,
  validTo: s.to || null,
  note: null,
});

function EntryRow({ entry }: { entry: Entry }) {
  const t = useTranslations("cal.timetable");
  const router = useRouter();
  const explain = useExplain();
  const init = {
    weekday: entry.weekday,
    start: formatTime(entry.startMinute),
    end: formatTime(entry.endMinute),
    room: entry.room ?? "",
    from: entry.validFrom,
    to: entry.validTo,
  };
  const [s, setS] = useState(init);
  const dirty = JSON.stringify(s) !== JSON.stringify(init);
  return (
    <li className="rounded-control border-border bg-card flex flex-wrap items-end gap-2 border p-3">
      <span className="min-w-28 text-sm font-semibold">{entry.label.split(" ")[0]}</span>
      <SlotFields prefix={entry.id} state={s} set={(p) => setS({ ...s, ...p })} />
      <Button
        type="button"
        disabled={!dirty}
        onClick={async () => {
          const r = await updateEntryAction({ entryId: entry.id, ...body(s) });
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
          const r = await removeEntryAction({ entryId: entry.id });
          if (r.ok) router.refresh();
          else toast.error(explain(r));
        }}
      >
        {t("remove")} <span className="sr-only">{entry.label}</span>
      </Button>
    </li>
  );
}

/** AC-4: add, change and remove the slots of a group. Clashes come back as a readable message. */
export function TimetableEditor({
  assignments,
  entries,
}: {
  assignments: Assignment[];
  entries: Entry[];
}) {
  const t = useTranslations("cal.timetable");
  const router = useRouter();
  const explain = useExplain();
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const [s, setS] = useState({
    weekday: 1,
    start: "08:00",
    end: "09:30",
    room: "",
    from: "",
    to: "",
  });
  const [pending, setPending] = useState(false);
  if (assignments.length === 0)
    return (
      <p className="rounded-control border-border bg-muted border p-3 text-sm">
        {t("noAssignments")}
      </p>
    );
  return (
    <div className="flex flex-col gap-6 print:hidden">
      <form
        className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          try {
            const r = await createEntryAction({ assignmentId, ...body(s) });
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
          <Label htmlFor="tt-assignment" className="text-[12px]">
            {t("form.assignment")}
          </Label>
          <Select
            id="tt-assignment"
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
          >
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <SlotFields prefix="new" state={s} set={(p) => setS({ ...s, ...p })} />
        <Button type="submit" disabled={pending}>
          {t("add")}
        </Button>
      </form>
      {entries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <EntryRow
              key={`${e.id}-${e.weekday}-${e.startMinute}-${e.endMinute}-${e.room}`}
              entry={e}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
