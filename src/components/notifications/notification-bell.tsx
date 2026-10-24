"use client";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllReadAction, markReadAction } from "@/lib/notify/notify.actions";

export type BellItem = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
};

/** AC-8/AC-10: the bell in the shell's notifications slot. Counts and items come from the layout. */
export function NotificationBell({ unread, items }: { unread: number; items: BellItem[] }) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const badge = unread > 9 ? "9+" : String(unread);

  async function open(item: BellItem) {
    if (!item.read) await markReadAction({ id: item.id });
    router.refresh();
    if (item.link) router.push(item.link);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("bell")}: ${t("bellCount", { count: unread })}`}
        className="rounded-control bg-card ring-border hover:bg-accent relative flex min-h-11 min-w-11 items-center justify-center shadow-sm ring-1"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="bg-danger absolute top-1 right-1 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-semibold text-white"
          >
            {badge}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel className="font-semibold">{t("title")}</DropdownMenuLabel>
        {items.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2 text-sm">{t("empty")}</p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="h-auto flex-col items-start gap-0.5 py-2"
              onSelect={() => void open(item)}
            >
              <span className="flex items-center gap-2 font-semibold">
                {!item.read && (
                  <span className="rounded-chip bg-info-bg text-info px-1 text-[11px] font-semibold">
                    {t("unread")}
                  </span>
                )}
                {item.title}
              </span>
              <span className="text-muted-foreground line-clamp-2 text-[13px]">{item.body}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        {unread > 0 && (
          <DropdownMenuItem
            onSelect={async () => {
              await markAllReadAction({});
              router.refresh();
            }}
          >
            {t("markAllRead")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/notifications">{t("openList")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/notifications/preferences">{t("preferences")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
