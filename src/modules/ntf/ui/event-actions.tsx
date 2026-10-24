"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
  cancelEventAction,
  publishEventAction,
  registerForEventAction,
  unregisterFromEventAction,
} from "../server/event.actions";

/** AC-3/AC-9: publish a draft, cancel a published event. */
export function EventStatusActions({
  eventId,
  status,
}: {
  eventId: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
}) {
  const t = useTranslations("evt");
  const router = useRouter();
  const message = (m: string) =>
    t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : t("errors.generic");

  async function publish() {
    const result = await publishEventAction({ eventId });
    if (result.ok) {
      toast.success(t("actions.published"));
      router.refresh();
    } else toast.error(message(result.error.message));
  }
  async function cancel() {
    const result = await cancelEventAction({ eventId });
    if (result.ok) {
      toast.success(t("actions.cancelled"));
      router.refresh();
    } else toast.error(message(result.error.message));
  }

  if (status === "CANCELLED") return null;
  if (status === "PUBLISHED")
    return (
      <ConfirmDialog
        trigger={<Button variant="secondary">{t("actions.cancel")}</Button>}
        title={t("actions.cancelTitle")}
        description={t("actions.cancelBody")}
        confirmLabel={t("actions.cancel")}
        destructive
        onConfirm={cancel}
      />
    );
  return <Button onClick={publish}>{t("actions.publish")}</Button>;
}

/** AC-4/AC-6: register for the event, or cancel my registration. */
export function RegisterButton({
  eventId,
  registered,
  canRegister,
  canCancel,
}: {
  eventId: string;
  registered: boolean;
  canRegister: boolean;
  canCancel: boolean;
}) {
  const t = useTranslations("evt");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const message = (m: string) =>
    t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : t("errors.generic");

  async function run(register: boolean) {
    setPending(true);
    try {
      const result = register
        ? await registerForEventAction({ eventId })
        : await unregisterFromEventAction({ eventId });
      if (result.ok) {
        toast.success(t(register ? "actions.registered" : "actions.unregistered"));
        router.refresh();
      } else toast.error(message(result.error.message));
    } finally {
      setPending(false);
    }
  }

  if (registered)
    return canCancel ? (
      <ConfirmDialog
        trigger={<Button variant="secondary">{t("actions.unregister")}</Button>}
        title={t("actions.unregisterTitle")}
        description={t("actions.unregisterBody")}
        confirmLabel={t("actions.unregister")}
        destructive
        onConfirm={() => run(false)}
      />
    ) : null;
  return canRegister ? (
    <Button disabled={pending} onClick={() => run(true)}>
      {t("actions.register")}
    </Button>
  ) : null;
}
