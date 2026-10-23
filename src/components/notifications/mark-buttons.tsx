"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { markAllReadAction, markReadAction } from "@/lib/notify/notify.actions";

export function MarkAllReadButton() {
  const t = useTranslations("notifications");
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        await markAllReadAction({});
        router.refresh();
      }}
    >
      {t("markAllRead")}
    </Button>
  );
}

/** AC-10: opens the notification's link and marks it read. */
export function OpenNotificationLink({
  id,
  link,
  read,
}: {
  id: string;
  link: string;
  read: boolean;
}) {
  const t = useTranslations("notifications");
  const router = useRouter();
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={async () => {
          if (!read) await markReadAction({ id });
          router.push(link);
          router.refresh();
        }}
      >
        {t("open")}
      </Button>
      {!read && (
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            await markReadAction({ id });
            router.refresh();
          }}
        >
          {t("markRead")}
        </Button>
      )}
    </>
  );
}
