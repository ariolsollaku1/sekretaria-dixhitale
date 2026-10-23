"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { startOfYearAction } from "../server/cohort.actions";

/** AC-9: confirm the previewed groups. */
export function StartOfYearForm({ yearId, count }: { yearId: string; count: number }) {
  const t = useTranslations("org.group.startOfYear");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function confirm() {
    setPending(true);
    try {
      const r = await startOfYearAction({ academicYearId: yearId });
      if (r.ok) {
        toast.success(t("done", { count: r.data.created }));
        router.push("/org/groups");
        router.refresh();
      } else toast.error(t("failed"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Button type="button" disabled={pending || count === 0} onClick={confirm}>
      {t("confirm", { count })}
    </Button>
  );
}
