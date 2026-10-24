"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import type { Question, Section } from "../domain/question-rules";
import { setQuestionsAction } from "../server/qa.actions";
import { useExplain } from "./explain";

type Row = { key: string; section: Section; type: "SCALE" | "TEXT"; sq: string; en: string };

const toRow = (q: Question): Row => ({
  key: q.key,
  section: q.section,
  type: q.type,
  sq: q.label.sq,
  en: q.label.en ?? "",
});

/** First free key `q1`, `q2`, ... */
const nextKey = (rows: Row[]) => {
  const used = new Set(rows.map((r) => r.key));
  let n = rows.length + 1;
  while (used.has(`q${n}`)) n++;
  return `q${n}`;
};

/** AC-2: the questions of a draft campaign (the keys are generated, labels in Albanian and English). */
export function QuestionEditor({
  campaignId,
  questions,
  editable,
}: {
  campaignId: string;
  questions: Question[];
  editable: boolean;
}) {
  const t = useTranslations("qa");
  const router = useRouter();
  const explain = useExplain();
  const [rows, setRows] = useState<Row[]>(questions.map(toRow));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const copy = [...rows];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    setRows(copy);
  };

  if (!editable)
    return rows.length === 0 ? (
      <p className="text-muted-foreground text-sm">{t("questions.none")}</p>
    ) : (
      <ol className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="rounded-card border-border bg-card border p-3 text-sm">
            <p className="font-semibold">{r.sq}</p>
            {r.en && <p className="text-muted-foreground">{r.en}</p>}
            <p className="text-muted-foreground mt-1 text-[13px]">
              {t(`section.${r.section}`)} · {t(`type.${r.type}`)}
            </p>
          </li>
        ))}
      </ol>
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await setQuestionsAction({
            campaignId,
            questions: rows.map((x) => ({
              key: x.key,
              section: x.section,
              type: x.type,
              label: { sq: x.sq, en: x.en || null },
            })) as never,
          });
          if (r.ok) {
            toast.success(t("questions.saved"));
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      {rows.length === 0 && <p className="text-muted-foreground text-sm">{t("questions.none")}</p>}
      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li
            key={r.key}
            className="rounded-card border-border bg-card flex flex-col gap-3 border p-3"
          >
            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-40 flex-col gap-1">
                <Label htmlFor={`q-section-${i}`} className="text-[12px]">
                  {t("questions.section")}
                </Label>
                <Select
                  id={`q-section-${i}`}
                  value={r.section}
                  onChange={(e) => set(i, { section: e.target.value as Section })}
                >
                  <option value="LECTURER">{t("section.LECTURER")}</option>
                  <option value="ADMINISTRATION">{t("section.ADMINISTRATION")}</option>
                </Select>
              </div>
              <div className="flex min-w-40 flex-col gap-1">
                <Label htmlFor={`q-type-${i}`} className="text-[12px]">
                  {t("questions.type")}
                </Label>
                <Select
                  id={`q-type-${i}`}
                  value={r.type}
                  onChange={(e) => set(i, { type: e.target.value as Row["type"] })}
                >
                  <option value="SCALE">{t("type.SCALE")}</option>
                  <option value="TEXT">{t("type.TEXT")}</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`q-sq-${i}`} className="text-[12px]">
                {t("questions.labelSq")}
              </Label>
              <Input
                id={`q-sq-${i}`}
                value={r.sq}
                maxLength={300}
                onChange={(e) => set(i, { sq: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`q-en-${i}`} className="text-[12px]">
                {t("questions.labelEn")}
              </Label>
              <Input
                id={`q-en-${i}`}
                value={r.en}
                maxLength={300}
                onChange={(e) => set(i, { en: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => move(i, -1)}
                disabled={i === 0}
              >
                {t("questions.up")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
              >
                {t("questions.down")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                {t("questions.remove")}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={rows.length >= 40}
          onClick={() =>
            setRows([
              ...rows,
              { key: nextKey(rows), section: "LECTURER", type: "SCALE", sq: "", en: "" },
            ])
          }
        >
          {t("questions.add")}
        </Button>
        <Button type="submit" disabled={pending}>
          {t("questions.save")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
