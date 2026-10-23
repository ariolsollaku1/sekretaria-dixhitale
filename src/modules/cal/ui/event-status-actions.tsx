"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { cancelEventAction, restoreEventAction } from "../server/event.actions";

/** AC-5: cancel (with confirmation) or restore an event. */
export function EventStatusActions({ eventId, active }: { eventId: string; active: boolean }) {
  const t = useTranslations("cal");
  const router = useRouter();
  const run = async () => {
    const result = await (active ? cancelEventAction : restoreEventAction)({ eventId });
    if (result.ok) {
      toast.success(t(active ? "actions.cancelled" : "actions.restored"));
      router.refresh();
    } else toast.error(t("errors.generic"));
  };
  return active ? (
    <ConfirmDialog
      trigger={<Button variant="secondary">{t("actions.cancel")}</Button>}
      title={t("actions.cancelTitle")}
      description={t("actions.cancelBody")}
      confirmLabel={t("actions.cancel")}
      destructive
      onConfirm={run}
    />
  ) : (
    <Button variant="secondary" onClick={run}>
      {t("actions.restore")}
    </Button>
  );
}
