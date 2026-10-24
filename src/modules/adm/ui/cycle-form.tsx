"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { saveCycleAction } from "../server/cycle.actions";

type Doc = { key: string; labelSq: string; labelEn: string; required: boolean };
export type CycleDraft = {
  id: string | null;
  academicYearId: string;
  name: string;
  opensOn: string;
  closesOn: string;
  active: boolean;
  documents: { key: string; labelSq: string; labelEn: string | null; required: boolean }[];
};

/** AC-1: create a cycle or change one; the document list is saved together with it. */
export function CycleForm({
  years,
  cycle,
}: {
  years: { id: string; label: string }[];
  cycle?: CycleDraft;
}) {
  const t = useTranslations("adm.cycles");
  const te = useTranslations("adm.errors");
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    academicYearId: cycle?.academicYearId ?? years[0]?.id ?? "",
    name: cycle?.name ?? "",
    opensOn: cycle?.opensOn ?? "",
    closesOn: cycle?.closesOn ?? "",
    active: cycle?.active ?? true,
  });
  const [docs, setDocs] = useState<Doc[]>(
    cycle?.documents.map((d) => ({ ...d, labelEn: d.labelEn ?? "" })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open)
    return (
      <Button type="button" variant={cycle ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {cycle ? t("edit") : t("add")}
      </Button>
    );

  const setDoc = (i: number, patch: Partial<Doc>) =>
    setDocs(docs.map((d, n) => (n === i ? { ...d, ...patch } : d)));
  const explain = (r: {
    error: { code: string; message: string; fieldErrors?: Record<string, string[]> };
  }) => {
    if (r.error.code === "FORBIDDEN") return te("FORBIDDEN");
    const field = r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : undefined;
    const code = field ?? r.error.message;
    return te.has(code as never) ? te(code as never) : te("generic");
  };

  return (
    <form
      className="rounded-card border-border bg-muted/40 flex flex-col gap-4 border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await saveCycleAction({
            cycleId: cycle?.id ?? null,
            ...v,
            documents: docs.map((d) => ({ ...d, labelEn: d.labelEn || null })),
          });
          if (r.ok) {
            toast.success(t("saved"));
            setOpen(false);
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-name`}>{t("name")}</Label>
          <Input
            id={`${uid}-name`}
            value={v.name}
            maxLength={80}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-year`}>{t("year")}</Label>
          <Select
            id={`${uid}-year`}
            value={v.academicYearId}
            onChange={(e) => setV({ ...v, academicYearId: e.target.value })}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-opens`}>{t("opensOn")}</Label>
          <Input
            id={`${uid}-opens`}
            type="date"
            value={v.opensOn}
            onChange={(e) => setV({ ...v, opensOn: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-closes`}>{t("closesOn")}</Label>
          <Input
            id={`${uid}-closes`}
            type="date"
            value={v.closesOn}
            onChange={(e) => setV({ ...v, closesOn: e.target.value })}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={v.active}
            onChange={(e) => setV({ ...v, active: e.target.checked })}
          />
          {t("active")}
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">{t("documents")}</legend>
        <p className="text-muted-foreground text-[13px]">{t("documentsHint")}</p>
        {docs.map((d, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-dk-${i}`} className="text-[12px]">
                {t("docKey")}
              </Label>
              <Input
                id={`${uid}-dk-${i}`}
                className="w-36"
                value={d.key}
                onChange={(e) => setDoc(i, { key: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-ds-${i}`} className="text-[12px]">
                {t("docLabelSq")}
              </Label>
              <Input
                id={`${uid}-ds-${i}`}
                value={d.labelSq}
                onChange={(e) => setDoc(i, { labelSq: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-de-${i}`} className="text-[12px]">
                {t("docLabelEn")}
              </Label>
              <Input
                id={`${uid}-de-${i}`}
                value={d.labelEn}
                onChange={(e) => setDoc(i, { labelEn: e.target.value })}
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={d.required}
                onChange={(e) => setDoc(i, { required: e.target.checked })}
              />
              {t("docRequired")}
            </label>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDocs(docs.filter((_, n) => n !== i))}
            >
              {t("removeDoc")}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => setDocs([...docs, { key: "", labelSq: "", labelEn: "", required: true }])}
        >
          {t("addDoc")}
        </Button>
      </fieldset>

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
