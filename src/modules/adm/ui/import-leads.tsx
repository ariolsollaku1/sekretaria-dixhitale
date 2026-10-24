"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { CSV_MAX_BYTES, LEAD_SOURCES, type LeadSource } from "../domain/lead-rules";
import { importLeadsAction } from "../server/lead.actions";
import { useExplain } from "./explain";

/** AC-4: import the leads of an event or campaign from a CSV file. */
export function ImportLeads() {
  const t = useTranslations("adm.import");
  const ts = useTranslations("adm.source");
  const router = useRouter();
  const explain = useExplain();
  const [source, setSource] = useState<LeadSource>("EVENT");
  const [sourceNote, setSourceNote] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        setProblems([]);
        try {
          const r = await importLeadsAction({ csv, source, sourceNote });
          if (!r.ok) setError(explain(r));
          else if (r.data.ok) {
            toast.success(t("done", { imported: r.data.imported, skipped: r.data.skipped }));
            setCsv("");
            setFileName("");
            setFileKey((k) => k + 1);
            router.refresh();
          } else if ("fileError" in r.data) setError(t(`fileErrors.${r.data.fileError}` as never));
          else {
            setError(t("rowErrors"));
            setProblems(
              r.data.errors
                .slice(0, 50)
                .map((x) =>
                  t("rowError", { line: x.line, reason: t(`reasons.${x.code}` as never) }),
                ),
            );
          }
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="text-muted-foreground text-sm">{t("hint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-source">{t("source")}</Label>
          <Select
            id="import-source"
            value={source}
            onChange={(e) => setSource(e.target.value as LeadSource)}
          >
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-note">{t("sourceNote")}</Label>
          <Input
            id="import-note"
            maxLength={200}
            value={sourceNote}
            onChange={(e) => setSourceNote(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-file">{t("file")}</Label>
          <Input
            key={fileKey}
            id="import-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setProblems([]);
              if (!file) {
                setCsv("");
                setFileName("");
                return;
              }
              if (file.size > CSV_MAX_BYTES) {
                setCsv("");
                setError(t("fileErrors.tooBig"));
                return;
              }
              setError(null);
              setFileName(file.name);
              setCsv(await file.text());
            }}
          />
        </div>
      </div>
      {fileName && <p className="text-muted-foreground text-[13px]">{fileName}</p>}
      {error && (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {error}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="text-danger list-disc pl-5 text-[13px]">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div>
        <Button type="submit" disabled={pending || !csv}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
