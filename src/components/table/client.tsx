"use client";
import { Printer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { deleteFilterAction, saveFilterAction } from "@/lib/tables/saved.actions";

/** AC-11: the browser's print dialog ("Save as PDF"); the shell and controls are print:hidden. */
export function PrintButton() {
  const t = useTranslations("table");
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Printer aria-hidden /> {t("print")}
    </Button>
  );
}

/** AC-6: name and store the current filters. */
export function SaveFilterForm({
  tableId,
  query,
  path,
}: {
  tableId: string;
  query: string;
  path: string;
}) {
  const t = useTranslations("table");
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await saveFilterAction({ tableId, name, query, path });
      if (result.ok) {
        setName("");
        toast.success(t("saved.saved"));
        router.refresh();
      } else if (result.error.fieldErrors?.name) {
        setError(
          t(
            result.error.fieldErrors.name[0] === "nameTaken"
              ? "saved.nameTaken"
              : "saved.nameRequired",
          ),
        );
      } else {
        setError(t(result.error.message === "LIMIT_REACHED" ? "saved.limit" : "saved.failed"));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="saved-name">{t("saved.name")}</Label>
        <Input
          id="saved-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "saved-name-error" : undefined}
          maxLength={60}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {t("saved.save")}
      </Button>
      {error && (
        <p
          id="saved-name-error"
          role="alert"
          className="text-danger w-full text-[13px] font-semibold"
        >
          {error}
        </p>
      )}
    </form>
  );
}

export function DeleteSavedFilter({ id, name, path }: { id: string; name: string; path: string }) {
  const t = useTranslations("table");
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`${t("saved.delete")}: ${name}`}
      onClick={async () => {
        const result = await deleteFilterAction({ id, path });
        if (result.ok) router.refresh();
        else toast.error(t("saved.failed"));
      }}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
