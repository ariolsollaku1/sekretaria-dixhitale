"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 10 * 1024 * 1024;

/** AC-9: the candidate picks a file for one document type; it goes to the token route. */
export function DocumentUpload({
  token,
  documentKey,
  hasFile,
}: {
  token: string;
  documentKey: string;
  hasFile: boolean;
}) {
  const t = useTranslations("adm.status");
  const router = useRouter();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(t("upload.TOO_LARGE"));
      input.value = "";
      return;
    }
    setPending(true);
    try {
      const body = new FormData();
      body.set("key", documentKey);
      body.set("file", file);
      const res = await fetch(`/api/adm/applications/${encodeURIComponent(token)}/documents`, {
        method: "POST",
        body,
      });
      if (res.ok) router.refresh();
      else {
        const json = (await res.json().catch(() => null)) as { code?: string } | null;
        const key = `upload.${json?.code ?? "FAILED"}`;
        setError(t.has(key as never) ? t(key as never) : t("upload.FAILED"));
      }
    } catch {
      setError(t("upload.FAILED"));
    } finally {
      setPending(false);
      input.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        id={id}
        type="file"
        className="sr-only"
        accept="application/pdf,image/jpeg,image/png"
        onChange={onPick}
        disabled={pending}
      />
      <Button type="button" variant="secondary" disabled={pending} asChild>
        <label htmlFor={id} className="cursor-pointer">
          {pending ? t("uploading") : hasFile ? t("replace") : t("choose")}
        </label>
      </Button>
      {error && (
        <p role="alert" className="text-danger text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}
