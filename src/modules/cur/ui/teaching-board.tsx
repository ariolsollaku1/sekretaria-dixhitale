"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { TEACHING_KINDS } from "../domain/teaching-rules";
import type { BoardAssignment, BoardGroup } from "../server/teaching.queries";
import {
  createAssignmentAction,
  removeAssignmentAction,
  updateAssignmentAction,
} from "../server/teaching.actions";

type Lecturer = { id: string; label: string; category: string };

function useExplain() {
  const t = useTranslations("cur.teaching");
  return (result: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    const code = result.error.fieldErrors
      ? Object.values(result.error.fieldErrors)[0]?.[0]
      : result.error.message;
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };
}

function AssignmentItem({ a, lecturers }: { a: BoardAssignment; lecturers: Lecturer[] }) {
  const t = useTranslations("cur.teaching");
  const router = useRouter();
  const explain = useExplain();
  const [staffId, setStaffId] = useState(a.staffId);
  const [hours, setHours] = useState(String(a.plannedHours));
  const dirty = staffId !== a.staffId || hours !== String(a.plannedHours);

  async function save() {
    const r = await updateAssignmentAction({
      assignmentId: a.id,
      staffId,
      plannedHours: Number(hours),
    });
    if (r.ok) {
      toast.success(t("saved"));
      router.refresh();
    } else toast.error(explain(r));
  }
  async function remove() {
    const r = await removeAssignmentAction({ assignmentId: a.id });
    if (r.ok) router.refresh();
    else toast.error(explain(r));
  }
  return (
    <li className="flex flex-wrap items-end gap-2 text-sm">
      <span className="w-24 font-semibold">{t(`kind.${a.kind}`)}</span>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${a.id}-lec`} className="sr-only">
          {t("columns.lecturer")} {t(`kind.${a.kind}`)}
        </Label>
        <Select id={`${a.id}-lec`} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          {!lecturers.some((l) => l.id === a.staffId) && (
            <option value={a.staffId}>{a.staffName}</option>
          )}
          {lecturers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex w-24 flex-col gap-1">
        <Label htmlFor={`${a.id}-h`} className="sr-only">
          {t("columns.hours")} {t(`kind.${a.kind}`)}
        </Label>
        <Input
          id={`${a.id}-h`}
          type="number"
          min={0}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>
      <Button type="button" disabled={!dirty} onClick={save}>
        {t("save")}
      </Button>
      <Button type="button" variant="ghost" onClick={remove}>
        {t("remove")} <span className="sr-only">{a.staffName}</span>
      </Button>
    </li>
  );
}

function AddAssignment({
  groupId,
  planCourseId,
  lecturers,
}: {
  groupId: string;
  planCourseId: string;
  lecturers: Lecturer[];
}) {
  const t = useTranslations("cur.teaching");
  const router = useRouter();
  const explain = useExplain();
  const [kind, setKind] = useState<(typeof TEACHING_KINDS)[number]>("LECTURE");
  const [staffId, setStaffId] = useState("");
  const [hours, setHours] = useState("");
  const [pending, setPending] = useState(false);
  const id = `${groupId}-${planCourseId}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const r = await createAssignmentAction({
        groupId,
        planCourseId,
        staffId,
        kind,
        ...(hours === "" ? {} : { plannedHours: Number(hours) }),
      });
      if (r.ok) {
        setStaffId("");
        setHours("");
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 print:hidden">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-kind`} className="text-[12px]">
          {t("columns.kind")}
        </Label>
        <Select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as never)}>
          {TEACHING_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-lec`} className="text-[12px]">
          {t("columns.lecturer")}
        </Label>
        <Select id={`${id}-lec`} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">—</option>
          {lecturers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex w-24 flex-col gap-1">
        <Label htmlFor={`${id}-h`} className="text-[12px]">
          {t("columns.hours")}
        </Label>
        <Input
          id={`${id}-h`}
          type="number"
          min={0}
          placeholder={t("hoursDefault")}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending || !staffId}>
        {t("assign")}
      </Button>
    </form>
  );
}

/** AC-6: the groups of the year with their courses and assignments; writers can add / change / remove. */
export function TeachingBoard({
  groups,
  lecturers,
  canWrite,
}: {
  groups: BoardGroup[];
  lecturers: Lecturer[];
  canWrite: boolean;
}) {
  const t = useTranslations("cur.teaching");
  if (groups.length === 0) return <p className="text-muted-foreground text-sm">{t("noGroups")}</p>;
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`g-${g.id}`}>
          <h2 id={`g-${g.id}`} className="mb-3 text-xl font-semibold">
            {g.programCode} · {g.cohort} · {g.name}
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {t("yearOfStudy", { year: g.yearOfStudy })}
            </span>
          </h2>
          {g.courses.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noCourses")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {g.courses.map((c) => (
                <li
                  key={c.planCourseId}
                  className="rounded-control border-border bg-card flex flex-col gap-3 border p-3"
                >
                  <p className="font-semibold">
                    <span className="font-tabular">{c.code}</span> — {c.name}
                    <span className="text-muted-foreground font-tabular ml-2 text-[13px] font-normal">
                      {t("courseMeta", {
                        semester: c.semester,
                        lecture: c.hoursLecture,
                        seminar: c.hoursSeminar,
                        lab: c.hoursLab,
                      })}
                    </span>
                  </p>
                  {c.assignments.length === 0 ? (
                    <p className="text-warning text-sm font-semibold">{t("unassigned")}</p>
                  ) : canWrite ? (
                    <ul className="flex flex-col gap-2">
                      {c.assignments.map((a) => (
                        <AssignmentItem
                          key={`${a.id}-${a.staffId}-${a.plannedHours}`}
                          a={a}
                          lecturers={lecturers}
                        />
                      ))}
                    </ul>
                  ) : (
                    <ul className="flex flex-col gap-1 text-sm">
                      {c.assignments.map((a) => (
                        <li key={a.id}>
                          {t(`kind.${a.kind}`)}: {a.staffName} · {a.plannedHours} {t("hoursUnit")}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canWrite && (
                    <AddAssignment
                      groupId={g.id}
                      planCourseId={c.planCourseId}
                      lecturers={lecturers}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
