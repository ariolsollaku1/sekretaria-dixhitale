"use client";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toaster";
import { commitStaffImportAction, previewStaffImportAction } from "../server/staff.actions";

type Preview = Awaited<ReturnType<typeof previewStaffImportAction>>;

/** AC-12: choose a file -> preview with errors -> confirm. The file is sent again on confirm. */
export function StaffImport() {
  const t = useTranslations("hr.import");
  const tc = useTranslations("hr");
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
      setPreview(await previewStaffImportAction(form));
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
      const result = await commitStaffImportAction(form);
      if (result.ok) {
        toast.success(t("done", result.data));
        router.push("/hr/staff");
        router.refresh();
      } else {
        const key = result.error.fieldErrors?.file?.[0] ?? result.error.code;
        toast.error(
          t.has(`fileErrors.${key}` as never)
            ? t(`fileErrors.${key}` as never)
            : tc("errors.generic"),
        );
        await choose(file);
      }
    } finally {
      setBusy(false);
    }
  }

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
          <a href="/hr/staff/import/template" className="text-sm underline" download>
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
              : tc("errors.generic")}
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
                {t("errors")}
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {preview.errors.slice(0, 200).map((e, i) => (
                  <li key={i}>
                    {t("row", { row: e.row })}: <span className="font-tabular">{e.field}</span> —{" "}
                    {tc.has(`errors.${e.code}` as never) ? tc(`errors.${e.code}` as never) : e.code}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.rows.length > 0 && (
            <div className="rounded-card border-border bg-card overflow-x-auto border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="p-3 font-semibold">
                      {tc("columns.name")}
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      {tc("columns.kind")}
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      {tc("columns.category")}
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      {tc("columns.contractStart")}
                    </th>
                    <th scope="col" className="p-3 font-semibold">
                      {tc("columns.status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 200).map((r) => (
                    <tr key={r.row} className="border-border border-b last:border-0">
                      <th scope="row" className="p-3 text-left font-semibold">
                        {r.input.lastName} {r.input.firstName}
                      </th>
                      <td className="p-3">{tc(`kind.${r.input.kind}`)}</td>
                      <td className="p-3">{tc(`category.${r.input.category}`)}</td>
                      <td className="font-tabular p-3">{r.input.contractStart}</td>
                      <td className="p-3">
                        <StatusBadge
                          tone={r.status === "new" ? "success" : "warning"}
                          label={t(r.status === "new" ? "new" : "exists")}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.rows.length > 200 && (
            <p className="text-muted-foreground text-sm">
              {t("truncated", { shown: 200, total: preview.rows.length })}
            </p>
          )}
          <div>
            <Button
              type="button"
              disabled={busy || hasErrors || preview.rows.length === 0}
              onClick={confirm}
            >
              {t("confirm", { count: preview.counts.created })}
            </Button>
            {hasErrors && <p className="text-muted-foreground mt-2 text-[13px]">{t("fixFirst")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
