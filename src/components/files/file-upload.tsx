"use client";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type UploadedFile = { id: string; fileName: string; mimeType: string; size: number };

const formatMb = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/**
 * AC-12: accessible upload control for a registered purpose. The server is the authority; the
 * pre-checks here only save a round trip. `maxBytes`/`mimeTypes` come from the purpose.
 */
export function FileUpload({
  purpose,
  maxBytes,
  mimeTypes,
  typeLabels,
  onUploaded,
  label,
}: {
  purpose: string;
  maxBytes: number;
  mimeTypes: readonly string[];
  /** Human names of the allowed types for the hint, e.g. ["PDF", "JPEG", "PNG"]. */
  typeLabels: readonly string[];
  onUploaded?: (file: UploadedFile) => void;
  label?: string;
}) {
  const t = useTranslations("files");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "ok"; name: string }
    | { kind: "error"; code: string }
  >({ kind: "idle" });

  async function upload(file: File) {
    if (file.size === 0) return setState({ kind: "error", code: "EMPTY" });
    if (file.size > maxBytes) return setState({ kind: "error", code: "TOO_LARGE" });
    if (file.type && !mimeTypes.includes(file.type))
      return setState({ kind: "error", code: "UNSUPPORTED_TYPE" });
    setState({ kind: "busy" });
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/files?purpose=${encodeURIComponent(purpose)}`, {
        method: "POST",
        body,
      });
      const json = (await res.json()) as
        { ok: true; data: UploadedFile } | { ok: false; error: { code: string } };
      if (json.ok) {
        setState({ kind: "ok", name: json.data.fileName });
        onUploaded?.(json.data);
      } else setState({ kind: "error", code: json.error.code });
    } catch {
      setState({ kind: "error", code: "INTERNAL" });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const known = (code: string) => (t.has(`errors.${code}` as never) ? code : "INTERNAL");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label ?? t("upload")}</Label>
      <p id={`${id}-hint`} className="text-muted-foreground text-[13px]">
        {t("hint", { max: formatMb(maxBytes), types: typeLabels.join(", ") })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={id}
          type="file"
          accept={mimeTypes.join(",")}
          aria-describedby={`${id}-hint ${id}-status`}
          disabled={state.kind === "busy"}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={state.kind === "busy"}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden /> {t("choose")}
        </Button>
        <p
          id={`${id}-status`}
          role={state.kind === "error" ? "alert" : "status"}
          className={state.kind === "error" ? "text-danger text-sm font-semibold" : "text-sm"}
        >
          {state.kind === "busy" && t("uploading")}
          {state.kind === "ok" && t("uploaded", { name: state.name })}
          {state.kind === "error" && t(`errors.${known(state.code)}` as never)}
        </p>
      </div>
    </div>
  );
}
