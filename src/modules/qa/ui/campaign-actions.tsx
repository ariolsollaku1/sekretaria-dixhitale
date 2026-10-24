"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { closeCampaignAction, openCampaignAction } from "../server/qa.actions";
import { useExplain } from "./explain";

/** AC-3: open a draft, close an open campaign (final). */
export function CampaignActions({
  campaignId,
  status,
}: {
  campaignId: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
}) {
  const t = useTranslations("qa");
  const router = useRouter();
  const explain = useExplain();
  const [error, setError] = useState<string | null>(null);
  if (status === "CLOSED") return null;

  async function run(kind: "open" | "close") {
    setError(null);
    const r = await (kind === "open" ? openCampaignAction : closeCampaignAction)({ campaignId });
    if (r.ok) {
      toast.success(t(kind === "open" ? "opened" : "closed"));
      router.refresh();
    } else setError(explain(r));
  }

  return (
    <div className="flex flex-col gap-2">
      {status === "DRAFT" ? (
        <ConfirmDialog
          trigger={<Button>{t("actions.open")}</Button>}
          title={t("actions.openTitle")}
          description={t("actions.openDescription")}
          confirmLabel={t("actions.open")}
          onConfirm={() => run("open")}
        />
      ) : (
        <ConfirmDialog
          destructive
          trigger={<Button variant="destructive">{t("actions.close")}</Button>}
          title={t("actions.closeTitle")}
          description={t("actions.closeDescription")}
          confirmLabel={t("actions.close")}
          onConfirm={() => run("close")}
        />
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
