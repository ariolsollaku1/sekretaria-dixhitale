"use client";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { retryJobAction } from "./jobs.actions";

export function RetryJobButton({ queue, id }: { queue: string; id: string }) {
  const t = useTranslations("jobs");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      aria-label={`${t("retry")}: ${queue}`}
      onClick={async () => {
        setPending(true);
        const result = await retryJobAction({ queue, id });
        setPending(false);
        if (result.ok) {
          toast.success(t("retried"));
          router.refresh();
        } else
          toast.error(result.error.message === "NOT_FAILED" ? t("notFailed") : t("retryFailed"));
      }}
    >
      <RotateCcw aria-hidden /> {t("retry")}
    </Button>
  );
}
