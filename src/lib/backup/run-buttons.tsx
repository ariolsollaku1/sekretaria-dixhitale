"use client";
import { DatabaseBackup, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { startBackupRunAction } from "./actions";

export function RunButtons() {
  const t = useTranslations("backups");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start(kind: "export" | "integrity") {
    setPending(true);
    const result = await startBackupRunAction({ kind });
    setPending(false);
    if (result.ok) {
      toast.success(t("queued"));
      router.refresh();
    } else if (result.error.message === "ALREADY_QUEUED") toast.error(t("alreadyQueued"));
    else if (result.error.code === "UNAVAILABLE") toast.error(t("jobsDown"));
    else toast.error(t("startFailed"));
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" disabled={pending} onClick={() => start("export")}>
        <DatabaseBackup aria-hidden /> {t("runExport")}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => start("integrity")}
      >
        <ShieldCheck aria-hidden /> {t("runIntegrity")}
      </Button>
    </div>
  );
}
