"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { archiveTemplateAction } from "../server/message.actions";

/** AC-4: archive a template (it stays in the database). */
export function TemplateArchive({ templateId, name }: { templateId: string; name: string }) {
  const t = useTranslations("msg.templates");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost">
          {t("archive")} <span className="sr-only">{name}</span>
        </Button>
      }
      title={t("archiveTitle")}
      description={t("archiveBody", { name })}
      confirmLabel={t("archive")}
      destructive
      onConfirm={async () => {
        const result = await archiveTemplateAction({ templateId });
        if (result.ok) {
          toast.success(t("archived"));
          router.refresh();
        } else toast.error(t("failed"));
      }}
    />
  );
}
