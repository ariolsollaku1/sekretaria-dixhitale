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
import {
  addPlanCourseAction,
  removePlanCourseAction,
  updatePlanAction,
  updatePlanCourseAction,
} from "../server/plan.actions";

export type EditorRow = {
  id: string;
  code: string;
  name: string;
  yearOfStudy: number;
  semester: number;
  credits: number;
  categoryId: string | null;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
  isElective: boolean;
};
type Option = { id: string; label: string };

function useExplain() {
  const t = useTranslations("cur.plan");
  const tc = useTranslations("cur");
  return (result: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    const code = result.error.fieldErrors
      ? Object.values(result.error.fieldErrors)[0]?.[0]
      : result.error.message;
    if (code && t.has(`errors.${code}` as never)) return t(`errors.${code}` as never);
    if (code && tc.has(`errors.${code}` as never)) return tc(`errors.${code}` as never);
    return t("errors.generic");
  };
}

/** One editable plan course. Saves on request; the page refreshes so totals are recomputed. */
function EditorRowForm({ row, categories }: { row: EditorRow; categories: Option[] }) {
  const t = useTranslations("cur.plan");
  const router = useRouter();
  const explain = useExplain();
  const [v, setV] = useState(row);
  const [pending, setPending] = useState(false);
  const num =
    (key: "credits" | "hoursLecture" | "hoursSeminar" | "hoursLab") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setV({ ...v, [key]: e.target.value === "" ? 0 : Number(e.target.value) });
  const dirty = JSON.stringify(v) !== JSON.stringify(row);

  async function save() {
    setPending(true);
    try {
      const r = await updatePlanCourseAction({
        planCourseId: row.id,
        yearOfStudy: v.yearOfStudy,
        semester: v.semester,
        credits: v.credits,
        categoryId: v.categoryId,
        hoursLecture: v.hoursLecture,
        hoursSeminar: v.hoursSeminar,
        hoursLab: v.hoursLab,
        isElective: v.isElective,
      });
      if (r.ok) {
        toast.success(t("editor.saved"));
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    setPending(true);
    try {
      const r = await removePlanCourseAction({ planCourseId: row.id });
      if (r.ok) router.refresh();
      else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }
  const field = (label: string, key: "credits" | "hoursLecture" | "hoursSeminar" | "hoursLab") => (
    <div className="flex w-20 flex-col gap-1">
      <Label htmlFor={`${row.id}-${key}`} className="text-[12px]">
        {label}
      </Label>
      <Input
        id={`${row.id}-${key}`}
        type="number"
        min={0}
        inputMode="numeric"
        value={v[key]}
        onChange={num(key)}
      />
    </div>
  );
  return (
    <li className="rounded-control border-border bg-card flex flex-wrap items-end gap-3 border p-3">
      <div className="min-w-48 flex-1">
        <p className="font-semibold">
          <span className="font-tabular">{row.code}</span> — {row.name}
        </p>
      </div>
      {field(t("editor.credits"), "credits")}
      {field(t("editor.lecture"), "hoursLecture")}
      {field(t("editor.seminar"), "hoursSeminar")}
      {field(t("editor.lab"), "hoursLab")}
      <div className="flex w-44 flex-col gap-1">
        <Label htmlFor={`${row.id}-cat`} className="text-[12px]">
          {t("editor.category")}
        </Label>
        <Select
          id={`${row.id}-cat`}
          value={v.categoryId ?? ""}
          onChange={(e) => setV({ ...v, categoryId: e.target.value || null })}
        >
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={v.isElective}
          onChange={(e) => setV({ ...v, isElective: e.target.checked })}
        />
        {t("editor.elective")}
      </label>
      <div className="flex gap-2">
        <Button type="button" disabled={pending || !dirty} onClick={save}>
          {t("editor.save")} <span className="sr-only">{row.code}</span>
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
          {t("editor.remove")} <span className="sr-only">{row.code}</span>
        </Button>
      </div>
    </li>
  );
}

/** AC-2/AC-3/AC-4: the draft editor — meta data, rows grouped by year and semester, add form. */
export function PlanEditor({
  planId,
  durationYears,
  rows,
  courses,
  categories,
  years,
  validFromId,
  notes,
  totalsBySemester,
}: {
  planId: string;
  durationYears: number;
  rows: EditorRow[];
  courses: Option[];
  categories: Option[];
  years: Option[];
  validFromId: string;
  notes: string;
  /** "year-semester" -> "credits / hours" shown in each group's heading */
  totalsBySemester: Record<string, string>;
}) {
  const t = useTranslations("cur.plan");
  const router = useRouter();
  const explain = useExplain();
  const [yearId, setYearId] = useState(validFromId);
  const [text, setText] = useState(notes);
  const [courseId, setCourseId] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState(1);
  const [semester, setSemester] = useState(1);
  const [elective, setElective] = useState(false);
  const [pending, setPending] = useState(false);
  const used = new Set(rows.map((r) => r.code));

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const r = await updatePlanAction({
        planId,
        validFromAcademicYearId: yearId,
        notes: text || null,
      });
      if (r.ok) {
        toast.success(t("editor.saved"));
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    setPending(true);
    try {
      const r = await addPlanCourseAction({
        planId,
        courseId,
        yearOfStudy,
        semester,
        isElective: elective,
      });
      if (r.ok) {
        setCourseId("");
        setElective(false);
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 print:hidden">
      <form onSubmit={saveMeta} className="flex max-w-2xl flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-year">{t("form.validFrom")}</Label>
          <Select id="meta-year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="meta-notes">{t("form.notes")}</Label>
          <Textarea
            id="meta-notes"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("editor.saveMeta")}
        </Button>
      </form>

      <form
        onSubmit={add}
        className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4"
      >
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="add-course">{t("editor.addCourse")}</Label>
          <Select id="add-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">—</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id} disabled={used.has(c.label.split(" — ")[0]!)}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex w-28 flex-col gap-1.5">
          <Label htmlFor="add-year">{t("editor.year")}</Label>
          <Select
            id="add-year"
            value={yearOfStudy}
            onChange={(e) => setYearOfStudy(Number(e.target.value))}
          >
            {Array.from({ length: durationYears }, (_, i) => i + 1).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex w-28 flex-col gap-1.5">
          <Label htmlFor="add-semester">{t("editor.semester")}</Label>
          <Select
            id="add-semester"
            value={semester}
            onChange={(e) => setSemester(Number(e.target.value))}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </Select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={elective}
            onChange={(e) => setElective(e.target.checked)}
          />
          {t("editor.elective")}
        </label>
        <Button type="submit" disabled={pending || !courseId}>
          {t("editor.add")}
        </Button>
        <p className="text-muted-foreground w-full text-[13px]">{t("editor.addHint")}</p>
      </form>

      {Array.from({ length: durationYears }, (_, i) => i + 1).map((year) => (
        <section key={year} aria-labelledby={`year-${year}`} className="flex flex-col gap-4">
          <h2 id={`year-${year}`} className="text-2xl font-semibold">
            {t("year", { year })}
          </h2>
          {[1, 2].map((sem) => {
            const group = rows.filter((r) => r.yearOfStudy === year && r.semester === sem);
            return (
              <div key={sem}>
                <h3 className="mb-2 text-lg font-semibold">
                  {t("semester", { semester: sem })}
                  <span className="text-muted-foreground font-tabular ml-2 text-sm font-normal">
                    {totalsBySemester[`${year}-${sem}`]}
                  </span>
                </h3>
                {group.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("editor.emptySemester")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {group.map((row) => (
                      <EditorRowForm
                        key={`${row.id}-${JSON.stringify(row)}`}
                        row={row}
                        categories={categories}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
