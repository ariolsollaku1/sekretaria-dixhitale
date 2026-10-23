"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
  archiveAnnouncementAction,
  publishAnnouncementAction,
} from "../server/announcement.actions";

/** AC-3/AC-4: publish a draft (or republish an archived notice) and archive a published one. */
export function AnnouncementStatusActions({
  announcementId,
  status,
}: {
  announcementId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}) {
  const t = useTranslations("ntf");
  const router = useRouter();
  const message = (m: string) =>
    t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : t("errors.generic");

  async function publish() {
    const result = await publishAnnouncementAction({ announcementId });
    if (result.ok) {
      toast.success(t("actions.published"));
      router.refresh();
    } else toast.error(message(result.error.fieldErrors?.expiresDate?.[0] ?? result.error.message));
  }
  async function archive() {
    const result = await archiveAnnouncementAction({ announcementId });
    if (result.ok) {
      toast.success(t("actions.archived"));
      router.refresh();
    } else toast.error(message(result.error.message));
  }

  if (status === "PUBLISHED")
    return (
      <ConfirmDialog
        trigger={<Button variant="secondary">{t("actions.archive")}</Button>}
        title={t("actions.archiveTitle")}
        description={t("actions.archiveBody")}
        confirmLabel={t("actions.archive")}
        destructive
        onConfirm={archive}
      />
    );
  return (
    <Button onClick={publish}>
      {t(status === "DRAFT" ? "actions.publish" : "actions.republish")}
    </Button>
  );
}
