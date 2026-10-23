"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { createFeedAction, revokeFeedAction } from "../server/feed.actions";

/** AC-12/AC-13: create / regenerate / revoke the personal iCal link; shown once after creation. */
export function FeedPanel({ appUrl, hasLink }: { appUrl: string; hasLink: boolean }) {
  const t = useTranslations("cal.feed");
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    try {
      const result = await createFeedAction({});
      if (result.ok) {
        setLink(`${appUrl.replace(/\/$/, "")}/api/calendar/${result.data.token}.ics`);
        router.refresh();
      } else toast.error(t("failed"));
    } finally {
      setPending(false);
    }
  }
  async function revoke() {
    setPending(true);
    try {
      const result = await revokeFeedAction({});
      if (result.ok) {
        setLink(null);
        toast.success(t("revoked"));
        router.refresh();
      } else toast.error(t("failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="feed-title" className="rounded-card border-border bg-card border p-4">
      <h2 id="feed-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted-foreground mb-3 text-sm">{t("hint")}</p>
      {link && (
        <div className="mb-3 flex flex-col gap-1.5">
          <label htmlFor="feed-link" className="text-sm font-semibold">
            {t("link")}
          </label>
          <Input id="feed-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <p className="text-muted-foreground text-[13px]">{t("shownOnce")}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={create}>
          {t(hasLink ? "regenerate" : "create")}
        </Button>
        {hasLink && (
          <Button type="button" variant="secondary" disabled={pending} onClick={revoke}>
            {t("revoke")}
          </Button>
        )}
      </div>
    </section>
  );
}
