"use client";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import {
  commitTimetableImportAction,
  previewTimetableImportAction,
} from "../server/timetable.actions";

type Preview = Awaited<ReturnType<typeof previewTimetableImportAction>>;

/** AC-6: choose a file -> preview with row errors and clashes -> confirm (all or nothing). */
export function TimetableImport() {
  const t = useTranslations("cal.timetable.import");
  const tt = useTranslations("cal.timetable");
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(f: File | null) {
    setFile(f);
    setPreview(null);
    if (!f) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", f);
      setPreview(await previewTimetableImportAction(form));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const r = await commitTimetableImportAction(form);
      if (r.ok) {
        toast.success(t("done", r.data));
        router.push("/cal/timetable");
        router.refresh();
      } else {
        toast.error(t("failed"));
        await choose(file);
      }
    } finally {
      setBusy(false);
    }
  }
  const codeText = (code: string) => {
    if (code.startsWith("CLASH:")) return tt("clash", { clashes: code.slice(6) });
    return t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : tt.has(`errors.${code}` as never)
        ? tt(`errors.${code}` as never)
        : code;
  };
  const hasErrors = preview?.ok === true && preview.errors.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{t("file")}</Label>
        <p className="text-muted-foreground text-[13px]">{t("hint")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            id={id}
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(e) => void choose(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden /> {t("choose")}
          </Button>
          <a href="/cal/timetable/import/template" className="text-sm underline" download>
            {t("template")}
          </a>
          {file && <span className="text-sm">{file.name}</span>}
        </div>
      </div>
      <div aria-live="polite">
        {busy && <p className="text-sm">{t("working")}</p>}
        {preview && !preview.ok && (
          <p
            role="alert"
            className="rounded-control border-danger/40 bg-danger-bg text-danger border p-3 text-sm font-semibold"
          >
            {t.has(`fileErrors.${preview.error}` as never)
              ? t(`fileErrors.${preview.error}` as never)
              : t("failed")}
            {"missing" in preview && preview.missing ? ` (${preview.missing.join(", ")})` : ""}
          </p>
        )}
      </div>
      {preview?.ok && (
        <>
          <p className="text-sm">{t("summary", preview.counts)}</p>
          {hasErrors && (
            <section
              aria-labelledby={`${id}-errors`}
              className="rounded-card border-danger/40 bg-danger-bg border p-4"
            >
              <h2 id={`${id}-errors`} className="text-danger mb-2 font-semibold">
                {t("errorsTitle")}
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {preview.errors.slice(0, 200).map((e, i) => (
                  <li key={i}>
                    {t("row", { row: e.row })}: <span className="font-tabular">{e.field}</span> —{" "}
                    {codeText(e.code)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div>
            <Button
              type="button"
              disabled={busy || hasErrors || preview.rows.length === 0}
              onClick={confirm}
            >
              {t("confirm", { count: preview.counts.valid })}
            </Button>
            {hasErrors && <p className="text-muted-foreground mt-2 text-[13px]">{t("fixFirst")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
